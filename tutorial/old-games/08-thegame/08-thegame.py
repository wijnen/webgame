# vim: set filetype=python :
import random

'''
Rules for this game:
There are four piles of cards, initially two start at 1, two at 100.
The first two piles must always go up, the last two always go down.
As an exception, a card that goes exactly 10 the other way is allowed.
For example, on a pile that goes up, 33 may be played when it is 43.
During your turn, you must play two or more cards.
At the end of the turn, the hand cards are refilled.
The players are a team, the score is the number of cards left when someone
cannot play anymore.  Lower is better.
When the drawing pile is empty, only 1 card is required per turn.
'''

name = 'Tutorial 8: The Game'

# Instead of a fixed number of players, a range can be given.  The actual
# number is chosen in the title screen.
num_players = (1, 5)

class Game:
	def run(self):
		self.Public.piles = [1, 1, 100, 100]
		self.deck = list(range(2, 100))
		random.shuffle(self.deck)
		# Publish game rules through self.Public.
		self.Public.handcards = 6 if len(self.players) > 2 else 9 - len(self.players)
		self.Public.minplay = 2
		for p in range(len(self.players)):
			self.players[p].Private.state = 'Waiting for your turn'
			self.players[p].Private.hand = self.make_hand([self.deck.pop() for t in range(self.Public.handcards)])
		while True:
			for p in range(len(self.players)):
				if len(self.players[p].Private.hand) == 0:
					continue
				self.Public.turn = p
				if len(self.deck) == 0:
					self.Public.minplay = 1
				self.Public.played = 0
				while True:
					# Private.state is added after Public.state, so include a separator.
					if len(self.deck) == 1:
						self.Public.state = '1 card left - '
					else:
						self.Public.state = '%d cards left - ' % len(self.deck)
					if self.Public.played < self.Public.minplay:
						# If more cards need to be played, but cannot, end game.
						if not any(self.valid(card[0], pile) for card in self.players[p].Private.hand for pile in range(len(self.Public.piles))):
							self.finish()
							return
						if self.Public.minplay - self.Public.played == 1:
							self.players[p].Private.state = 'Your turn; at least 1 card to play'
						else:
							self.players[p].Private.state = 'Your turn; at least %d cards to play' % (self.Public.minplay - self.Public.played)
					else:
						self.players[p].Private.state = 'Your turn'
					# Use a function to wait for valid input.
					card, pile = yield from self.get_input(p)
					if card is None:
						break
					self.Public.piles[pile] = card[0]
					self.players[p].Private.hand = self.make_hand(list(a[0] for a in self.players[p].Private.hand if a[0] != card[0]))
					self.Public.played += 1
				self.players[p].Private.state = 'Waiting for your turn'
				# Add new cards.
				self.players[p].Private.hand += [[self.deck.pop()] for t in range(min(self.Public.handcards - len(self.players[p].Private.hand), len(self.deck)))]
				# Recalculate abilities for all.
				for pp in self.players:
					pp.Private.hand = self.make_hand(list(a[0] for a in pp.Private.hand))
				if all(len(pp.Private.hand) == 0 for pp in self.players):
					self.finish()
					return
	def get_input(self, p):
		while True:
			args = (yield {'play': p})['args']
			if len(args) != 2:
				print('invalid number of arguments given: %s' % repr(args))
				continue
			card, pile = args
			if self.Public.played >= self.Public.minplay and card is None:
				return None, None
			if not any(card == c[0] for c in self.players[p].Private.hand):
				print('invalid card played')
				continue
			card = tuple(c[0] for c in self.players[p].Private.hand if c[0] == card)
			if not 0 <= pile < len(self.Public.piles):
				print('invalid pile')
				continue
			if not self.valid(card[0], pile):
				print('invalid card for pile')
				continue
			return card, pile
	def valid(self, card, pile):
		if pile < 2:
			return card > self.Public.piles[pile] or card == self.Public.piles[pile] - 10
		else:
			return card < self.Public.piles[pile] or card == self.Public.piles[pile] + 10
	def make_hand(self, hand):
		hand.sort()
		return [(h, tuple(self.valid(h, i) for i in range(len(self.Public.piles)))) for h in hand]
	def finish(self):
		# Game ends.
		self.Public.state = 'Game ended, score = %d' % (sum(len(player.Private.hand) for player in self.players) + len(self.deck))
		for p in self.players:
			p.Private.state = None
