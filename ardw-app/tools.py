import logging
from re import I
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

        self.in_bounds = None 

    # pos and neg must be the same, but bounds, val, and unit of None match anything
    def matches(self, other: 'DebugCard') -> bool:
        if self.pos["type"] != other.pos["type"] or self.pos["val"] != other.pos["val"]:
            return False
        if self.neg["type"] != other.neg["type"] or self.neg["val"] != other.neg["val"]:
            return False
        if self.lo is not None and other.lo is not None and self.lo != other.lo:
            return False
        if self.hi is not None and other.hi is not None and self.hi != other.hi:
            return False
        if self.val is not None and other.val is not None and self.val != other.val:
            return False
        if self.unit is not None and other.unit is not None and self.unit != other.unit:
            return False
        return True
    
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

    def __repr__(self) -> str:
        return str(self.asdict())


class DebugSession:
    def __init__(self, name="", notes=""):
        self.name: str = name
        self.notes: str = notes
        self.timestamp: str = time.strftime("%H:%M:%S", time.localtime())
        self.cards: list[DebugCard] = []

    def find_match(self, card: DebugCard) -> int:
        for i, existing in enumerate(self.cards):
            if card.matches(existing):
                return i
        return -1

    # returns tuple of card result, id, update bool
    def measure(self, pos, neg, val, unit):
        measurement_card = DebugCard(pos, neg, val, unit)
        match = self.find_match(measurement_card)
        if match != -1:
            self.cards[match].val = val
            self.cards[match].unit = unit
            return self.cards[match], match, True
        else:
            self.cards.append(measurement_card)
            return measurement_card, len(self.cards) - 1, False

    def export(self):
        logging.info("Export is WIP")
        logging.info(str(self))

    def asdict(self) -> dict:
        return {
            "name": self.name,
            "notes": self.notes,
            "timestamp": self.timestamp,
            "cards": self.cards
        }

    def __repr__(self) -> str:
        return str(self.asdict)
