# Public.board = {'i.j': [piece]}, with piece player number or -1 for a red ring.

name = 'Tutorial 10: Dvonn'
num_players = 2

class Game:
	def encode(self, pos):
		return '%d.%d' % tuple(pos)
	def decode(self, epos):
		return tuple(int(i) for i in epos.split('.'))
	def run(self): # {{{
		yield from self.setup()
		yield from self.main()
		scores = [sum(len(self.Public.board[epos]) for epos in self.Public.board if len(self.Public.board[epos]) > 0 and self.Public.board[epos][-1] == player) for player in range(2)]
		for player in range(2):
			self.players[player].Private.state = 'Game ended, scores: ' + repr(scores)
		return scores
	# }}}
	def setup(self): # {{{
		self.Public.board = {}
		for i in range(11):
			for j in range(5):
				if 2 <= i + j <= 12:
					self.Public.board[self.encode((i, j))] = []
		for t in range(49):
			player = t & 1
			self.players[player].Private.state = 'Place a piece'
			self.players[player].Private.setup = [self.decode(epos) for epos in self.Public.board if len(self.Public.board[epos]) == 0]
			self.players[1 - player].Private.state = 'Wait for your turn'
			# Get a position from alternating players, which doesn't have a piece on it yet.
			p = (yield from self.get_pos(player, 'setup', lambda pos: len(self.Public.board[self.encode(pos)]) == 0))
			del self.players[player].Private['setup']
			self.Public.board[self.encode(p)].append(-1 if t < 3 else player)
	# }}}
	def main(self): # {{{
		last_moved = True
		while True:
			for player in range(2):
				options = self.get_options(player)
				if len(options) == 0:
					if not last_moved:
						return
					last_moved = False
					continue
				last_moved = True
				self.players[1 - player].Private.state = 'Wait for your turn'
				self.players[player].Private.state = 'Choose a piece to move'
				self.players[player].Private.options = options
				src = (yield from self.get_pos(player, 'pick', lambda p: self.encode(p) in options, encoded = True))
				del self.players[player].Private.options
				self.players[player].Private.state = 'Choose where to move to'
				self.players[player].Private.targets = options[self.encode(src)]
				dst = (yield from self.get_pos(player, 'place', lambda p: p in options[self.encode(src)]))
				del self.players[player].Private.targets
				self.Public.board[self.encode(dst)].extend(self.Public.board[self.encode(src)])
				self.Public.board[self.encode(src)] = []
				# Remove dead groups.
				queue = [self.decode(epos) for epos in self.Public.board.keys() if -1 in self.Public.board[epos]]
				towers = [self.decode(epos) for epos in self.Public.board.keys() if self.decode(epos) not in queue and len(self.Public.board[epos]) > 0]
				while len(queue) > 0:
					current = queue.pop()
					for i, j in ((1, 0), (0, 1), (-1, 1)):
						for d in (1, -1):
							target = (current[0] + d * i, current[1] + d * j)
							if target in towers:
								queue.append(target)
								towers.remove(target)
				for pos in towers:
					self.Public.board.pop(self.encode(pos))
	# }}}
	def get_pos(self, player, command, acceptable, encoded = False): # {{{
		while True:
			pos = (yield {command: player})['args'][0]
			if encoded:
				pos = self.decode(pos)
			pos = tuple(pos)
			if self.encode(pos) in self.Public.board and acceptable(pos):
				return pos
			else:
				print('ignoring invalid pos {}'.format(pos))
	# }}}
	def get_options(self, player): # {{{
		ret = {}
		for epos in self.Public.board:
			h = len(self.Public.board[epos])
			if h == 0:
				continue
			if self.Public.board[epos][-1] != player:
				continue
			pos = self.decode(epos)
			option = []
			allowed = False
			for i, j in ((1, 0), (0, 1), (-1, 1)):
				for d in (1, -1):
					# Update allowed based on direct neighbors.
					target = (pos[0] + d * i, pos[1] + d * j)
					if self.encode(target) not in self.Public.board or len(self.Public.board[self.encode(target)]) == 0:
						allowed = True
					# Check target.
					target = (pos[0] + d * i * h, pos[1] + d * j * h)
					if self.encode(target) not in self.Public.board:
						continue
					if len(self.Public.board[self.encode(target)]) == 0:
						continue
					option.append(target)
			if allowed and len(option) > 0:
				ret[epos] = option
		return ret
	# }}}

# vim: set filetype=python foldmethod=marker :
