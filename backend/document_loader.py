import os
from pypdf import PdfReader
from docx import Document


def extract_text_from_pdf(file_path: str) -> str:
    text = ""

    reader = PdfReader(file_path)

    for page_number, page in enumerate(reader.pages, start=1):
        page_text = page.extract_text()

        if page_text:
            text += f"\n\n[Page {page_number}]\n{page_text}"

    return text


def extract_text_from_docx(file_path: str) -> str:
    document = Document(file_path)
    text = ""

    for paragraph in document.paragraphs:
        if paragraph.text.strip():
            text += paragraph.text + "\n"

    return text


def extract_text_from_txt(file_path: str) -> str:
    with open(file_path, "r", encoding="utf-8") as file:
        return file.read()


def extract_text(file_path: str) -> str:
    extension = os.path.splitext(file_path)[1].lower()

    if extension == ".pdf":
        return extract_text_from_pdf(file_path)

    elif extension == ".docx":
        return extract_text_from_docx(file_path)

    elif extension == ".txt":
        return extract_text_from_txt(file_path)

    else:
        raise ValueError("Unsupported file type. Please upload PDF, DOCX, or TXT.")