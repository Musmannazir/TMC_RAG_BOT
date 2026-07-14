"""
Retrieval quality check: for each (question, expected_source) pair in
questions.csv, retrieve top-k chunks and check whether the expected source
file shows up among them. Reports recall@k.

Run (from backend/):
    python eval/eval_retrieval.py

Edit eval/questions.csv to match your real PDF filenames and the actual
content inside them — the shipped file is a starting template.
"""
import csv
import sys
from pathlib import Path

sys.path.append(str(Path(__file__).resolve().parent.parent))  # so `import config` works

import config
from langchain_huggingface import HuggingFaceEmbeddings
from langchain_community.vectorstores import FAISS


def load_questions(csv_path: Path):
    rows = []
    with open(csv_path, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            rows.append((row["question"], row["expected_source"]))
    return rows


def main():
    csv_path = Path(__file__).parent / "questions.csv"
    if not (config.VECTORSTORE_DIR / "index.faiss").exists():
        print("Vector store not found. Run `python ingest.py` first.")
        sys.exit(1)

    embeddings = HuggingFaceEmbeddings(model_name=config.EMBEDDING_MODEL)
    vectorstore = FAISS.load_local(
        str(config.VECTORSTORE_DIR), embeddings, allow_dangerous_deserialization=True
    )
    retriever = vectorstore.as_retriever(search_kwargs={"k": config.TOP_K})

    pairs = load_questions(csv_path)
    hits = 0
    print(f"Evaluating {len(pairs)} questions at k={config.TOP_K}\n")
    print(f"{'HIT':<5}{'Question':<55}{'Expected source'}")
    print("-" * 100)

    for question, expected_source in pairs:
        docs = retriever.invoke(question)
        retrieved_sources = {d.metadata.get("source", "") for d in docs}
        hit = expected_source in retrieved_sources
        hits += int(hit)
        mark = "PASS" if hit else "FAIL"
        print(f"{mark:<5}{question[:53]:<55}{expected_source}")

    recall = hits / len(pairs) if pairs else 0.0
    print("-" * 100)
    print(f"\nRecall@{config.TOP_K}: {hits}/{len(pairs)} = {recall:.2%}")


if __name__ == "__main__":
    main()