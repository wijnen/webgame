# vim: set tabstop=4 filetype=python :

'''Quarto: simple game to demonstrate the use of the python-webgame system.
This is a two player game.  Every turn, one player picks a piece and the other
player places it on the board.  The player who makes 4 in a row with a common
property wins.  There are four properties: size, color, open/closed and shape.
On the left are the pieces that can be selected, on the right is the board.

The main purpose of this game is to serve as an example for how games can be
made with the python-webgame module.  This is a simple example that only shows
the basics.
'''

name = 'Tutorial 7: Quarto'

# The module reads some settings from global variables.  This defines that
# every game is played with two players.
num_players = 2

# Almost everything in the game is defined in the Game class, which must be
# named like this.
class Game:
	def run(self):
		'''The main function.
		When this function ends, the game is over.  It can return a
		player number of the winning player, or None if there is no
		winner.
		'''
		# Self.Public is a magic object; all clients are automatically informed
		# of any changes made to it.  It can contain primitive types, lists and
		# dicts, but no other objects.  Tuples are converted to lists.
		#
		# In this game, there are only two Public variables: the current board,
		# and the available pieces.
		self.Public.board = [[None] * 4 for y in range(4)]
		self.Public.pieces = list(range(16))
		self.Public.bounce = []
		# The game ends in a tie if both players have had 8 turns.
		for turn in range(8):
			for p in range(2):
				# Let one player pick a piece.
				# self.players[].Private is a magic object like
				# self.Public, but it is only shared with the
				# client that controls that player.
				self.players[1 - p].Private.pick = True
				self.players[1 - p].Private.state = 'Pick a piece'
				self.Public.piece = None
				while True:
					# Yield causes the program to wait until valid input is
					# received from a player, or a timeout is reached.  In this
					# case, only one command is valid and it can only be sent
					# by one player.
					#
					# A dict argument is the most powerful.  The keys are
					# possible commands, and the values are the player nunmber,
					# or a sequence of player numbers, for those that are
					# allowed to use it.
					#
					# Alternatively, it can be None, to signify every player
					# may use it.  In addition, there may be a None key, with a
					# numerical value, which is the timeout in seconds.
					#
					# Instead of a dict, a list or tuple can be given.  It must
					# contain zero or one numbers, and zero or more strings.
					# The number is used as the timeout, the strings are
					# commands that every player may use.
					#
					# A single number or string may also be used; this is
					# treated as if it was the only item in a list.
					cmd = (yield {'pick': 1 - p})
					# Check valid piece.
					piece = cmd['args'][0]
					if 0 <= piece < len(self.Public.pieces) and self.Public.pieces[piece] is not None:
						break
					print('invalid piece %s' % piece)
				self.players[1 - p].Private.pick = False
				self.players[1 - p].Private.state = 'Wait for your turn'
				# Update choice.
				self.Public.piece = piece
				# Let the other player place the piece.
				self.players[p].Private.place = True
				self.players[p].Private.state = 'Place the piece'
				while True:
					x, y = (yield {'place': p})['args']
					# Check valid place.
					if 0 <= x < 4 and 0 <= y < 4 and self.Public.board[y][x] is None:
						break
				self.players[p].Private.place = False
				# Update board.
				self.Public.pieces[piece] = None
				self.Public.bounce = [t == piece for t in range(16)]
				self.Public.board[y][x] = piece
				# Check victory.
				pieces = self.victory()
				if len(pieces) > 0:
					v = [False for t in range(16)]
					for x, y in pieces:
						v[self.Public.board[y][x]] = True
					self.Public.bounce = v
					self.Public.piece = None
					self.players[p].Private.state = 'You won!'
					self.players[1 - p].Private.state = 'You lost!'
					# Returning from the run function ends the game.  The
					# return value is sent to the client.  This game uses it to
					# communicate the winner.
					return p
		for p in range(2):
			self.players[1].Private.state = 'Game ended; no winner'
	def victory(self):
		'''Check if the game has been won.'''
		ret = []
		for h in range(4):
			pieces = [(h, v) for v in range(4)]
			if self.check(pieces):
				ret += pieces
		for v in range(4):
			pieces = [(h, v) for h in range(4)]
			if self.check(pieces):
				ret += pieces
		pieces = [(i, i) for i in range(4)]
		if self.check(pieces):
			ret += pieces
		pieces = [(i, 3 - i) for i in range(4)]
		if self.check(pieces):
			ret += pieces
		return ret
	def check(self, positions):
		'''Check if a certian set of positions is a winning line.'''
		if any(self.Public.board[y][x] is None for x, y in positions):
			return False
		for i in range(4):
			if all(self.Public.board[y][x] & (1 << i) for x, y in positions):
				return True
			if not any(self.Public.board[y][x] & (1 << i) for x, y in positions):
				return True
		return False
