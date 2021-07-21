'''
To run games made for python-webgame, including this one, just run
webgame-build.

Then use your browser to visit: http://localhost:8891
'''

# Specifying the number of players per game is required.
num_players = 1

class Game:
	'''
	The game is a class; when multiple games are running, each is an
	instance of this class.
	This class must be named Game.
	'''
	def run(self):
		'''The run function defines all the game rules.
		It must be a generator (it must contain at least one yield
		statement or expression).  More about this is discussed in
		later examples.
		'''
		yield 0
