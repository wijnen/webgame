'''
To run games for this tutorial, go to the tutorial directory (the one which has
a "games" subdirectory, which contains the directory where this file is
located) and run webgame-update-games once. Then run webgame from that same
directory.

Then use your browser to visit: http://localhost:8891
'''

# A game always starts with some constants that describe the game. It only
# contains information about the game type; all (variable) state for a running
# game is in an instance of class Game, which is defined below.

# The name of a game defaults to the filename, but that is usually not good
# enough.

# Note that games are sorted by filename, so by using an index as a prefix to
# the filename, the sort order can be set.

# This python file must have exactly the same name as the directory it is in,
# plus the .py extension.
name = 'Tutorial 0: Non-game'

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
