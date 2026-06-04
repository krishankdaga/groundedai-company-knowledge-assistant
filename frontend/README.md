# GroundedAI — Company Knowledge Base Assistant

GroundedAI is a modern company knowledge base assistant that uses an LLM with Retrieval-Augmented Generation (RAG) to answer questions from uploaded company documents.

The goal of this project is to reduce hallucinations by grounding every answer in uploaded documents, showing source references, using confidence scoring, and verifying whether the generated answer is supported by retrieved context.

---

## Project Objective

Companies often have many internal documents such as HR policies, onboarding guides, SOPs, technical documentation, project guidelines, and FAQs. Employees may waste time searching through these documents manually.

GroundedAI solves this by allowing employees to ask questions in natural language and receive answers based only on the uploaded documents.

If the answer is not found in the documents, the system refuses to guess.

---

## Key Features

### Authentication and Role-Based Access

The application supports user registration and login.

There are two roles:

#### Admin
Admin users can:

- Ask questions
- Upload company documents
- View uploaded documents
- Delete uploaded documents
- View dashboard statistics
- View query logs
- Monitor hallucination risk

#### User / Employee
Normal users can:

- Ask questions from the company knowledge base

They cannot upload/delete documents or access admin dashboard.

---

## RAG-Based Question Answering

The project uses Retrieval-Augmented Generation.

Workflow:

1. Admin uploads a document.
2. Backend extracts text from the document.
3. Text is split into chunks.
4. Each chunk is converted into embeddings.
5. Embeddings are stored in ChromaDB.
6. User asks a question.
7. System retrieves the most relevant document chunks.
8. The LLM answers using only the retrieved context.
9. The answer is returned with confidence, verification, and sources.

---

## Hallucination Control

GroundedAI includes multiple hallucination-control mechanisms:

### 1. Context-Only Prompting

The LLM is instructed to answer only from the provided retrieved document context.

If the answer is not present, it must respond:

```text
I could not find this information in the uploaded company documents.