import csv
import sys
import re
import time
from pathlib import Path

sys.path.append(str(Path(__file__).resolve().parent.parent))

import config
from rag_chain import ask as rag_ask
from langchain_groq import ChatGroq

JUDGE_PROMPT = """You are a strict evaluator. Given a CONTEXT and an ANSWER,
determine if the ANSWER is fully supported by the CONTEXT (no invented facts,
no outside knowledge). If the ANSWER correctly says "I don't have that
information" and the CONTEXT genuinely doesn't contain the answer, that also
counts as faithful.

Respond with ONLY a single number from 0 to 10:
  10 = fully grounded, every claim traceable to the context
  5  = partially grounded, some unsupported claims
  0  = mostly or entirely hallucinated

CONTEXT:
{context}

ANSWER:
{answer}

Score (just the number):"""


def main():
    csv_path = Path(__file__).parent / "questions.csv"
    questions = []
    with open(csv_path, newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            questions.append(row["question"])

    judge = ChatGroq(model=config.GROQ_MODEL, api_key=config.GROQ_API_KEY, temperature=0)

    scores = []
    print(f"Evaluating faithfulness for {len(questions)} questions\n")
    print(f"{'Score':<7}{'Question'}")
    print("-" * 100)

    for i, q in enumerate(questions):
        # Fresh, isolated session per question — no shared history, no
        # growing token count, and each eval question is independent.
        session_id = f"eval-faithfulness-{i}"

        answer = None
        for attempt in range(4):
            try:
                result = rag_ask(q, session_id, full_context=True)
                answer = result["answer"]
                context = result.get("full_context") or "(no context retrieved)"
                break
            except Exception as e:
                if attempt == 3:
                    print(f"SKIP   {q[:80]}  (failed after retries: {e})")
                    break
                time.sleep(15 * (attempt + 1))  # backoff for Groq rate limits

        if answer is None:
            continue

        judge_input = JUDGE_PROMPT.format(context=context, answer=answer)

        raw_score = None
        for attempt in range(4):
            try:
                raw_score = judge.invoke(judge_input).content.strip()
                break
            except Exception as e:
                if attempt == 3:
                    print(f"SKIP   {q[:80]}  (judge failed: {e})")
                    break
                time.sleep(15 * (attempt + 1))

        if raw_score is None:
            continue

        match = re.search(r"\d+(\.\d+)?", raw_score)
        score = float(match.group()) if match else 0.0
        scores.append(score)
        print(f"{score:<7}{q[:80]}")

        time.sleep(2)  # small pause between questions to stay under TPM limits

    avg = sum(scores) / len(scores) if scores else 0
    print("-" * 100)
    print(f"Average faithfulness score: {avg:.1f} / 10  ({avg*10:.1f}%)  [{len(scores)}/{len(questions)} scored]")
if __name__ == "__main__":
    main()