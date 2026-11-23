"""
Shared helpers for the detection logic.

NOTE: This is a placeholder scoring system so the whole pipeline (upload ->
detect -> response) works end-to-end. Later, you'll swap the scoring inside
image_detector.py for your actual trained model - everything else stays the same.
"""
import hashlib
import random


def seeded_random(seed_bytes: bytes) -> random.Random:
    """Same file always gets the same 'random' score, instead of
    flickering between runs - makes testing predictable."""
    digest = hashlib.sha256(seed_bytes).hexdigest()
    return random.Random(int(digest[:16], 16))


def score_to_verdict(score: float):
    """score: 0.0 (authentic) -> 1.0 (ai-generated)."""
    if score >= 0.65:
        verdict = "ai_generated"
    elif score <= 0.35:
        verdict = "likely_authentic"
    else:
        verdict = "inconclusive"

    center = score * 100
    spread = 6 + 10 * (1 - abs(score - 0.5) * 2)
    low = max(0.0, center - spread)
    high = min(100.0, center + spread)
    return verdict, round(low, 1), round(high, 1)