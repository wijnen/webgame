name = 'Tutorial 5: Visual Novel'
num_players = 1

# Choose a data structure that fits your needs.
# This novel only has one speaker, so I don't need to include the speaker.
scenes = {
	'start': [
		"Welcome, class",
		"Today we'll discuss yesterday's experiment.",
		"Remember what we did?",
		"We had a long stick, with a nail in each end.",
		"It was resting on two wine glasses with those nails.",
		"Then with a club, I hit the stick in the middle, so it broke.",
		('loop',)],
	'loop': [
		("Did the glasses break?", ('Yes', 'wrong'), ('No', 'intact'))],
	'intact': [
		"But I'm applying a downward force.",
		("Why don't the nails move into the glass?", ("Right, they do.", "break"), ("Because the halves also rotate.", 'rotate'))],
	'rotate': [
		"Very good!",
		"The center of gravity goes down,",
		"but the rotation causes the far ends to go up.",
		"So the motion of the nails is away from the glasses",
		"and so they don't break.",
		"That's all for today, see you tomorrow."],
	'break': [
		"But if they would, the glasses would break!",
		('wrong',)],
	'wrong': [
		"Didn't you pay attention yesterday?",
		"The glasses didn't break, remember?",
		"So let's try that again.",
		('loop',)]}

class Game:
	def run(self):
		self.Public.scene = scenes['start']
		while self.Public.scene is not None:
			# Use yield with a string argument to allow that command from players.
			cmd = yield 'choose'
			# The args field in the yield result are the arguments the player sent.
			# In this case, there is one argument, which is the name of the next scene.
			scene = cmd['args'][0]
			# Change current scene based on choice.
			# Note that a "cheating" player can make a choice that isn't possible.
			if scene in scenes:
				self.Public.scene = scenes[scene]
