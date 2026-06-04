import os
import uuid
import chromadb
from dotenv import load_dotenv
from groq import Groq
from sentence_transformers import SentenceTransformer
from langchain_text_splitters import RecursiveCharacterTextSplitter

load_dotenv()

GROQ_API_KEY = os.getenv("GROQ_API_KEY")

if not GROQ_API_KEY:
    raise ValueError("GROQ_API_KEY is missing. Please add it to your .env file.")

groq_client = Groq(api_key=GROQ_API_KEY)

embedding_model = SentenceTransformer("all-MiniLM-L6-v2")

chroma_client = chromadb.PersistentClient(path="./chroma_db")

collection = chroma_client.get_or_create_collection(name="company_documents")


def chunk_text(text: str):
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=800,
        chunk_overlap=150
    )

    return splitter.split_text(text)


def add_document_to_vector_db(file_name: str, text: str):
    chunks = chunk_text(text)

    if not chunks:
        return {
            "status": "failed",
            "message": "No readable text found in document."
        }

    ids = []
    embeddings = []
    documents = []
    metadatas = []

    for index, chunk in enumerate(chunks):
        chunk_id = str(uuid.uuid4())
        embedding = embedding_model.encode(chunk).tolist()

        ids.append(chunk_id)
        embeddings.append(embedding)
        documents.append(chunk)
        metadatas.append({
            "file_name": file_name,
            "chunk_index": index
        })

    collection.add(
        ids=ids,
        embeddings=embeddings,
        documents=documents,
        metadatas=metadatas
    )

    return {
        "status": "success",
        "file_name": file_name,
        "chunks_added": len(chunks)
    }


def retrieve_relevant_chunks(question: str, top_k: int = 4):
    question_embedding = embedding_model.encode(question).tolist()

    results = collection.query(
        query_embeddings=[question_embedding],
        n_results=top_k
    )

    documents = results.get("documents", [[]])[0]
    metadatas = results.get("metadatas", [[]])[0]
    distances = results.get("distances", [[]])[0]

    retrieved_chunks = []

    for doc, metadata, distance in zip(documents, metadatas, distances):
        retrieved_chunks.append({
            "content": doc,
            "metadata": metadata,
            "distance": distance
        })

    return retrieved_chunks


def calculate_confidence(chunks):
    if not chunks:
        return "Low"

    avg_distance = sum(chunk["distance"] for chunk in chunks) / len(chunks)

    if avg_distance < 0.7:
        return "High"
    elif avg_distance < 1.2:
        return "Medium"
    else:
        return "Low"


def verify_answer_with_context(question: str, answer: str, context: str):
    verifier_prompt = f"""
You are a hallucination verification system.

Your task is to check whether the AI answer is fully supported by the provided context.

Rules:
1. If the answer is completely supported by the context, return only: SUPPORTED
2. If the answer contains any information not present in the context, return only: NOT_SUPPORTED
3. Do not explain your reasoning.
4. Do not add any extra text.

Context:
{context}

Question:
{question}

Answer:
{answer}

Verification:
"""

    response = groq_client.chat.completions.create(
        model="llama-3.1-8b-instant",
        messages=[
            {
                "role": "user",
                "content": verifier_prompt
            }
        ],
        temperature=0,
        max_tokens=20
    )

    verdict = response.choices[0].message.content.strip().upper()

    if verdict == "SUPPORTED":
        return "SUPPORTED"

    return "NOT_SUPPORTED"


def generate_answer(question: str):
    retrieved_chunks = retrieve_relevant_chunks(question)

    confidence = calculate_confidence(retrieved_chunks)

    if not retrieved_chunks or confidence == "Low":
        return {
            "answer": "I could not find this information in the uploaded company documents.",
            "confidence": "Low",
            "sources": [],
            "status": "Not Found",
            "verification": "NOT_SUPPORTED"
        }

    context = "\n\n".join(
        [
            f"Source: {chunk['metadata']['file_name']}, Chunk: {chunk['metadata']['chunk_index']}\n{chunk['content']}"
            for chunk in retrieved_chunks
        ]
    )

    system_prompt = """
You are GroundedAI, a company knowledge base assistant.

Rules:
1. Answer only using the provided context.
2. Do not use outside knowledge.
3. Do not guess.
4. If the answer is not present in the context, say:
   "I could not find this information in the uploaded company documents."
5. Keep the answer clear and professional.
6. Mention the source document names used.
"""

    user_prompt = f"""
Context:
{context}

Question:
{question}

Answer:
"""

    response = groq_client.chat.completions.create(
        model="llama-3.1-8b-instant",
        messages=[
            {
                "role": "system",
                "content": system_prompt
            },
            {
                "role": "user",
                "content": user_prompt
            }
        ],
        temperature=0.1,
        max_tokens=700
    )

    answer = response.choices[0].message.content.strip()

    verification_status = verify_answer_with_context(
        question=question,
        answer=answer,
        context=context
    )

    if verification_status != "SUPPORTED":
        return {
            "answer": "I could not confidently verify this answer from the uploaded company documents.",
            "confidence": confidence,
            "sources": [],
            "status": "Verifier Failed",
            "verification": verification_status
        }

    sources = []

    for chunk in retrieved_chunks:
        sources.append({
            "file_name": chunk["metadata"]["file_name"],
            "chunk_index": chunk["metadata"]["chunk_index"],
            "distance": chunk["distance"]
        })

    return {
        "answer": answer,
        "confidence": confidence,
        "sources": sources,
        "status": "Grounded",
        "verification": verification_status
    }