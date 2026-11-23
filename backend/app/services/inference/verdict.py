"""
Turning model scores into a verdict, a likelihood range and plain-language reasons.

Numbers shown in the app (confidence_low / confidence_high) are the likelihood, in percent,
that the file is AI-generated.
"""
from typing import Optional, Tuple

from ...config import settings

LIKELY_AUTHENTIC = "likely_authentic"
AI_GENERATED = "ai_generated"
INCONCLUSIVE = "inconclusive"

# A supporting model (your own face / video models) can pull "likely authentic" back to
# "inconclusive" when it is this sure the file is fake. It can never create a "fake" verdict.
SUPPORT_ALARM = 0.85


def band(score: float) -> str:
    if score >= settings.ai_above:
        return AI_GENERATED
    if score <= settings.real_below:
        return LIKELY_AUTHENTIC
    return INCONCLUSIVE


def pct_range(score: float, spread: float) -> Tuple[float, float]:
    low = max(0.0, score - spread) * 100
    high = min(1.0, score + spread) * 100
    return round(low, 1), round(high, 1)


def pct(x: float) -> str:
    return f"{round(x * 100)}%"


def support_alarm(support: Optional[float]) -> bool:
    return support is not None and support >= SUPPORT_ALARM