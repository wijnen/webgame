from random import choice

name = 'Tutorial 6: Flip'
num_players = 1
w, h = 3, 3
size = w * h

class Game:
	def run(self):
		self.Public.board = [choice((False, True)) for p in range(size)]
		while any(t != self.Public.board[0] for t in self.Public.board):
			x, y = (yield 'flip')['args']
			for d in ((-1, 0), (1, 0), (0, 0), (0, -1), (0, 1)):
				if not 0 <= x + d[0] < w or not 0 <= y + d[1] < h:
					continue
				f = w * (y + d[1]) + (x + d[0])
				self.Public.board[f] = not self.Public.board[f]
