# vim: set filetype=python :
# Public.scores = [int] for every player; lower is better.
# Public.board = [[int], [int], [int], [int]] cards on the table.
# Private.hand = [int] cards in hand.

import random

name = 'Tutorial 9: Take 5'

num_players = 2, 10

num_cards = 10

class Game:
	def choose(self, p):
		'''Let one player choose a card.
		One instance of this function will run for each player.
		When a player has chosen a card, its function returns.
		The main function continues when all players have chosen a card.
		'''
		self.players[p].Private.choosing = True;
		self.players[p].Private.state = 'Select a card to play';
		while True:
			choice = (yield {'choose': p})['args'][0]
			if choice in self.players[p].Private.hand:
				self.players[p].Private.hand.remove(choice)
				self.players[p].Private.choosing = False;
				self.players[p].Private.state = 'Wait for others to select their card';
				return choice

	def choose_row(self, p):
		'''Let the player choose a row to take.'''
		self.players[p].Private.taking = True;
		self.players[p].Private.state = 'Select a row to take';
		while True:
			row = (yield {'take': p})['args'][0]
			if 0 <= row < 4:
				self.players[p].Private.taking = False;
				self.players[p].Private.state = '';
				return row

	def run(self):
		# Prepare the deck.
		deck = list(range(1, 105))
		random.shuffle(deck)
		# Initialize scores.
		self.Public.scores = [0] * len(self.players)
		# Prepare the board.
		self.Public.board = [[deck.pop()] for i in range(4)]
		# Prepare players hands.
		for p, pl in enumerate(self.players):
			pl.Private.hand = [deck.pop() for i in range(num_cards)]
			pl.Private.choosing = False
			pl.Private.taking = False
		# Start the game.
		for round in range(num_cards):
			# Start a task for each player to choose.
			for p, pl in enumerate(self.players):
				# This will start a "parallel" task that is
				# handled by the main loop.  It's not really
				# parallel; only one thing runs at a time.
				# The task will not actually start until this
				# task yields, so pl.task is guaranteed to have
				# its value when the task first runs.
				pl.task = self.launch(self.choose(p), 'player {}'.format(p))
			# Wait for all tasks to finish.
			# The tasks may finish in a different order; their
			# notification will be pending until it is read.
			# It would have been possible to wait for all tasks at
			# once, but that just makes the code more complex.
			for p, pl in enumerate(self.players):
				# Use the return value.
				pl.choice = yield pl.task
			# Handle the turn.
			playerlist = list(range(len(self.players)))
			playerlist.sort(key = lambda x: self.players[x].choice)
			for p in playerlist:
				options = [c for c in range(len(self.Public.board)) if self.Public.board[c][-1] < self.players[p].choice]
				if len(options) == 0:
					# Choose a row to take.
					row = yield from self.choose_row(p)
					self.take(p, row)
				else:
					row = max(options, key = lambda x: self.Public.board[x][-1])
				if len(self.Public.board[row]) >= 5:
					self.take(p, row)
				self.Public.board[row].append(self.players[p].choice)

	def take(self, player, row):
		# Add player score.
		for c in self.Public.board[row]:
			if c == 55:
				self.Public.scores[player] += 7
			elif c % 11 == 0:
				self.Public.scores[player] += 5
			elif c % 10 == 0:
				self.Public.scores[player] += 3
			elif c % 10 == 5:
				self.Public.scores[player] += 2
			else:
				self.Public.scores[player] += 1
		self.Public.board[row] = []
