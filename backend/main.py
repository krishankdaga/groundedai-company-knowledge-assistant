import os
import json
import shutil
import hashlib
import secrets
from fastapi import FastAPI, UploadFile, File, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, EmailStr
from sqlalchemy.orm import Session

from document_loader import extract_text
from rag_pipeline import add_document_to_vector_db, generate_answer
from database import create_tables, get_db, QueryLog, User

app = FastAPI(
    title="GroundedAI - Company Knowledge Base Assistant",
    description="A RAG-based AI assistant that answers questions from company documents.",
    version="1.4.0"
)

UPLOAD_DIR = "uploads"

os.makedirs(UPLOAD_DIR, exist_ok=True)

create_tables()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class QuestionRequest(BaseModel):
    question: str


class RegisterRequest(BaseModel):
    name: str
    email: EmailStr
    password: str


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


def hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    password_hash = hashlib.sha256((salt + password).encode()).hexdigest()
    return f"{salt}${password_hash}"


def verify_password(password: str, stored_password_hash: str) -> bool:
    try:
        salt, password_hash = stored_password_hash.split("$")
        check_hash = hashlib.sha256((salt + password).encode()).hexdigest()
        return check_hash == password_hash
    except Exception:
        return False


@app.get("/")
def root():
    return {
        "message": "GroundedAI backend is running.",
        "version": "1.4.0",
        "features": [
            "Register and login",
            "Role based access",
            "First user admin, later users employee",
            "Document upload",
            "Document listing",
            "Document deletion",
            "RAG question answering",
            "Hallucination verification",
            "SQLite query logging",
            "Dashboard stats"
        ]
    }


@app.post("/register")
def register_user(request: RegisterRequest, db: Session = Depends(get_db)):
    if len(request.password) < 6:
        raise HTTPException(
            status_code=400,
            detail="Password must be at least 6 characters long."
        )

    if not request.name.strip():
        raise HTTPException(
            status_code=400,
            detail="Name cannot be empty."
        )

    existing_user = db.query(User).filter(User.email == request.email).first()

    if existing_user:
        raise HTTPException(
            status_code=400,
            detail="An account with this email already exists."
        )

    existing_users_count = db.query(User).count()
    assigned_role = "admin" if existing_users_count == 0 else "user"

    new_user = User(
        name=request.name.strip(),
        email=request.email,
        password_hash=hash_password(request.password),
        role=assigned_role
    )

    db.add(new_user)
    db.commit()
    db.refresh(new_user)

    return {
        "message": "User registered successfully.",
        "user": {
            "id": new_user.id,
            "name": new_user.name,
            "email": new_user.email,
            "role": new_user.role
        }
    }


@app.post("/login")
def login_user(request: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == request.email).first()

    if not user:
        raise HTTPException(
            status_code=401,
            detail="Invalid email or password."
        )

    if not verify_password(request.password, user.password_hash):
        raise HTTPException(
            status_code=401,
            detail="Invalid email or password."
        )

    return {
        "message": "Login successful.",
        "user": {
            "id": user.id,
            "name": user.name,
            "email": user.email,
            "role": user.role
        }
    }


@app.post("/upload")
async def upload_document(file: UploadFile = File(...)):
    allowed_extensions = [".pdf", ".docx", ".txt"]
    file_extension = os.path.splitext(file.filename)[1].lower()

    if file_extension not in allowed_extensions:
        raise HTTPException(
            status_code=400,
            detail="Unsupported file type. Please upload PDF, DOCX, or TXT."
        )

    file_path = os.path.join(UPLOAD_DIR, file.filename)

    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    try:
        text = extract_text(file_path)

        if not text.strip():
            raise HTTPException(
                status_code=400,
                detail="Could not extract readable text from the document."
            )

        result = add_document_to_vector_db(file.filename, text)

        return {
            "message": "Document uploaded and indexed successfully.",
            "result": result
        }

    except Exception as error:
        raise HTTPException(
            status_code=500,
            detail=str(error)
        )


@app.get("/documents")
def get_documents():
    documents = []

    if not os.path.exists(UPLOAD_DIR):
        return {
            "documents": documents
        }

    for file_name in os.listdir(UPLOAD_DIR):
        file_path = os.path.join(UPLOAD_DIR, file_name)

        if os.path.isfile(file_path):
            file_size = os.path.getsize(file_path)
            file_extension = os.path.splitext(file_name)[1].lower()

            documents.append({
                "file_name": file_name,
                "file_size": file_size,
                "file_type": file_extension,
                "file_path": file_path
            })

    return {
        "documents": documents
    }


@app.delete("/documents/{file_name}")
def delete_document(file_name: str):
    file_path = os.path.join(UPLOAD_DIR, file_name)

    if not os.path.exists(file_path):
        raise HTTPException(
            status_code=404,
            detail="Document not found."
        )

    try:
        os.remove(file_path)

        return {
            "message": f"{file_name} deleted successfully from uploads folder.",
            "note": "The file was removed from local storage. Existing vector embeddings may still remain until ChromaDB is rebuilt."
        }

    except Exception as error:
        raise HTTPException(
            status_code=500,
            detail=str(error)
        )


@app.post("/ask")
def ask_question(request: QuestionRequest, db: Session = Depends(get_db)):
    if not request.question.strip():
        raise HTTPException(
            status_code=400,
            detail="Question cannot be empty."
        )

    result = generate_answer(request.question)

    sources_as_text = json.dumps(result.get("sources", []))

    query_log = QueryLog(
        question=request.question,
        answer=result.get("answer", ""),
        confidence=result.get("confidence", ""),
        status=result.get("status", ""),
        verification=result.get("verification", ""),
        sources=sources_as_text
    )

    db.add(query_log)
    db.commit()
    db.refresh(query_log)

    result["log_id"] = query_log.id

    return result


@app.get("/stats")
def get_stats(db: Session = Depends(get_db)):
    logs = db.query(QueryLog).all()

    total_questions = len(logs)

    grounded_answers = len([
        log for log in logs if log.status == "Grounded"
    ])

    not_found_answers = len([
        log for log in logs if log.status == "Not Found"
    ])

    verifier_failed = len([
        log for log in logs if log.status == "Verifier Failed"
    ])

    high_confidence = len([
        log for log in logs if log.confidence == "High"
    ])

    medium_confidence = len([
        log for log in logs if log.confidence == "Medium"
    ])

    low_confidence = len([
        log for log in logs if log.confidence == "Low"
    ])

    hallucination_risk = "Low"

    if total_questions > 0:
        risk_ratio = verifier_failed / total_questions

        if risk_ratio >= 0.3:
            hallucination_risk = "High"
        elif risk_ratio >= 0.1:
            hallucination_risk = "Medium"

    return {
        "total_questions": total_questions,
        "grounded_answers": grounded_answers,
        "not_found_answers": not_found_answers,
        "verifier_failed": verifier_failed,
        "confidence_breakdown": {
            "high": high_confidence,
            "medium": medium_confidence,
            "low": low_confidence
        },
        "hallucination_risk": hallucination_risk
    }


@app.get("/logs")
def get_logs(db: Session = Depends(get_db)):
    logs = db.query(QueryLog).order_by(QueryLog.created_at.desc()).limit(50).all()

    formatted_logs = []

    for log in logs:
        try:
            parsed_sources = json.loads(log.sources) if log.sources else []
        except Exception:
            parsed_sources = []

        formatted_logs.append({
            "id": log.id,
            "question": log.question,
            "answer": log.answer,
            "confidence": log.confidence,
            "status": log.status,
            "verification": log.verification,
            "sources": parsed_sources,
            "created_at": log.created_at.isoformat() if log.created_at else None
        })

    return {
        "logs": formatted_logs
    }


@app.delete("/logs")
def clear_logs(db: Session = Depends(get_db)):
    db.query(QueryLog).delete()
    db.commit()

    return {
        "message": "All query logs cleared successfully."
    }