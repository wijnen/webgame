name = 'Tutorial 2: Stop Motion Animation'
num_players = 1

# This is a small stop-motion animation.

# The script for the animation.  Every item has elements x, y, rotation,
# duration, text.  They are used in the run function.
script = [
		[0, 0, 0, 2, 'I like to go for a walk.'],
		[1, 0, 0, .5, ''],
		[2, 0, 0, .5, ''],
		[3, 0, 0, .5, ''],
		[4, 0, 0, 2, "Actually, I'd rather go back."],
		[4, 0, 40, .5, ''],
		[4, 0, 80, .5, ''],
		[4, 0, 120, .5, ''],
		[4, 0, 160, .5, ''],
		[4, 0, 180, .5, ''],
		[3, 0, 180, .5, ''],
		[2, 0, 180, .5, ''],
		[1, 0, 180, .5, ''],
		[0, 0, 180, .5, ''],
		[0, 0, 140, .5, ''],
		[0, 0, 100, .5, ''],
		[0, 0, 60, .5, ''],
		[0, 0, 40, .5, ''],
	]

class Game:
	def run(self):
		# self.Public is automatically shared with the clients.  This
		# "game" uses only one item in there, monkey.  It is a list of
		# three numbers: x, y, rotation.
		self.Public.monkey = [0, 0, 0]
		# Repeat forever.
		while True:
			# Read one script line at a time.
			for x, y, rz, t, text in script:
				# Set the monkey to its values.  "90 +" is a
				# hack to correct for the incorrect orientation
				# of the model.
				self.Public.monkey = [x, y, 90 + rz, text]
				# Wait for the required duration.  The argument
				# is an absolute time, as returned by
				# time.time().  Whenever this function runs,
				# self.now is already set to the current time.
				yield self.now + t
