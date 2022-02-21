import logging
import time


class DebugCard:
    def __init__(self, device, pos, neg, unit=None, val=None, lo=None, hi=None) -> None:
        self.device: str = device
        self.pos: dict = pos
        self.neg: dict = neg
        self.unit: str = unit
        self.val: float = val
        self.lo: float = lo
        self.hi: float = hi
        if unit is None:
            self.lo = None
            self.hi = None

    def __repr__(self) -> str:
        return str(self.__dict__)

    # returns true iff self is a valid measurement update for target
    def will_update(self, target) -> bool:
        if target.is_complete():
            return False
        return (
            self.device == target.device and
            self.pos == target.pos and
            self.neg == target.neg and
            (target.unit is None or self.unit == target.unit)
        )

    def is_complete(self) -> bool:
        return self.val is not None

    # 0 is inbounds, -1 is too low, +1 is too high, None is no bounds/val
    def inbounds(self) -> int:
        if self.val is None or (self.lo is None and self.hi is None):
            return None
        elif self.lo is not None and self.val < self.lo:
            return -1
        elif self.hi is not None and self.val > self.hi:
            return 1
        else:
            return 0

    def to_dict(self) -> dict:
        return self.__dict__


class DebugSession:
    def __init__(self, name="", notes="") -> None:
        self.name: str = name
        self.notes: str = notes
        self.timestamp: str = time.strftime("%H:%M:%S", time.localtime())
        self.cards: list[DebugCard] = []
        self.next: int = -1

    def __repr__(self) -> str:
        return str(self.__dict__)

    def add_card(self, card: DebugCard) -> int:
        i = len(self.cards)
        self.cards.append(card)
        if not card.is_complete() and self.next == -1:
            self.next = i
        return i

    def remove_card(self, i) -> DebugCard:
        if self.next == i:
            self.__update_next(i + 1)
        return self.cards.pop(i)

    def get_next(self):
        if self.next == -1:
            return -1, None
        else:
            return self.next, self.cards[self.next]

    # returns the resulting card, the id of the card, and update flag
    def measure(self, device, pos, neg, unit, val):
        measure_card = DebugCard(device, pos, neg, unit, val)
        # check if we have a card for this measurement
        for i, card in enumerate(self.cards):
            if measure_card.will_update(card):
                card.unit = measure_card.unit
                card.val = measure_card.val
                if self.next == i:
                    self.__update_next(i + 1)
                return card, i, True
        
        # didn't have a matching card, so just append to end of deck
        self.cards.append(measure_card)
        return measure_card, len(self.cards) - 1, False

    def export(self) -> None:
        logging.info("Export WIP")
        logging.info(str(self))

    def to_dict(self) -> dict:
        output = self.__dict__.copy()
        output["cards"] = []
        for card in self.cards:
            output["cards"].append(card.__dict__)
        return output

    def __update_next(self, start=0):
        self.next = -1
        for i in range(start, len(self.cards)):
            if not self.cards[i].is_complete():
                self.next = i
                break
