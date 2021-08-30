
import time


class DebugCard:
    def __init__(self, pos, neg=None, val=None, unit=None, lo=None, hi=None):
        # pos and neg should be dict with "type" and "val"
        self.pos = pos
        self.neg = neg
        self.val = val
        self.unit = unit
        if unit is None:
            # no bounds without a unit
            self.lo = None
            self.hi = None
        else:
            self.lo = lo
            self.hi = hi

    # unspecified unit is considered a match with any unit
    def matches(self, other: 'DebugCard') -> bool:
        if self.unit != other.unit and self.unit is not None and other.unit is not None:
            return False
        return (
            self.pos["type"] == other.pos["type"] and
            self.pos["val"] == other.pos["val"] and
            self.neg["type"] == other.neg["type"] and
            self.neg["val"] == other.neg["val"]
        )
    
    # unspecified unit is only equal to unspecified unit
    def equals(self, other: 'DebugCard') -> bool:
        return (
            self.pos["type"] == other.pos["type"] and
            self.pos["val"] == other.pos["val"] and
            self.neg["type"] == other.neg["type"] and
            self.neg["val"] == other.neg["val"] and
            self.unit == other.unit
        )

    def asdict(self) -> dict:
        return {
            "pos": self.pos,
            "neg": self.neg,
            "val": self.val,
            "unit": self.unit,
            "lo": self.lo,
            "hi": self.hi
        }


class DebugSession:
    def __init__(self, name="", notes=""):
        self.name: str = name
        self.notes: str = notes
        self.timestamp: str = time.strftime("%H:%M:%S", time.localtime())
        self.cards: list[DebugCard] = []

    def has(self, newcard: DebugCard, exact=False) -> int:
        for i in range(len(self.cards)):
            card = self.cards[i]
            if exact and card.equals(newcard):
                return i
            elif not exact and card.matches(newcard):
                return i
        return -1

    def export(self):
        pass

    def asdict(self) -> dict:
        return {
            "name": self.name,
            "notes": self.notes,
            "timestamp": self.timestamp
        }
