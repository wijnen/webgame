'''webgame_client.py - module for writing a webgame AI client.

This module defines the AI class, which conects to a webgame server. It defines
the run() function in the main program, which should be called as the only
action (optionally, configuration can be parsed).

Several variables are created in the main namespace:
	game: the socket connecting to the game server
	name: the username of this connection
	Public: a dict which is synchronised the the public game data
	Private: a dict which is synchronised the the private game data

The main program must contain a class named AI. An instance is created after a
connection is made. It may define any of the following member functions:
	new_game(): called when a new game is joined.
	update(): called after any update is handled.
	Public_update(changes): called after an update to Public is handled. changes is a dict with the old values of changed elements.
	Private_update(changes): called after an update to Private is handled. changes is a dict with the old values of changed elements.
	end(arg): called when the game ends. The argument is what the server returned.

Any game-specific calls from the server are passed unchanged to the main AI class.
'''

import websocketd
import __main__
import fhs

fhs.module_init('game', {'name': 'ai', 'myname': 'ai'})

class Undefined:
	def __bool__(self):
		return False
undefined = Undefined()

class AI:
	def __init__(self, socket):
		__main__.game = socket
		self._connected = False
	def name(self, name):
		__main__.Public = {}
		__main__.Private = {}
		__main__.name = name
		self._user = __main__.AI()
	def _make_changes(self, obj, value, changes, path):
		#websocketd.log('make changes at path {}, set {} to {}'.format(path, obj, value))
		if not isinstance(value, (dict, list)):
			c = changes
			if obj != value:
				for p in path[:-1]:
					if p not in c:
						c[p] = {}
					c = c[p]
				if (isinstance(obj, dict) and path[-1] in obj) or (isinstance(obj, list) and path[-1] < len(obj)):
					c[path[-1]] = obj[path[-1]]
				else:
					c[path[-1]] = undefined
			return
		obj = obj[path[-1]] if obj and path[-1] in obj else undefined
		if isinstance(value, dict):
			for v in value:
				path.append(v)
				self._make_changes(obj[v] if obj and v in obj else undefined, value[v], changes, path)
				path.pop()
		else:
			for i, v in enumerate(value):
				path.append(i)
				self._make_changes(obj[i] if obj and i < len(obj) else undefined, v, changes, path)
				path.pop()
		if isinstance(obj, dict):
			for v in obj:
				if value is not undefined and v in value:
					continue
				path.append(v)
				self._make_changes(obj[v], undefined, changes, path)
				path.pop()
		elif isinstance(obj, list):
			for i in range(len(obj) - 1, len(value) if value is not undefined else 0, -1):
				path.append(i)
				self._make_changes(obj[i], undefined, changes, path)
				path.pop()
	def _update(self, obj, path, value):
		target = obj[0]
		for component in path[:-1]:
			target = target[component]
		if path != []:
			changes = {}
			self._make_changes(target, value, changes, path)
			if isinstance(target, list) and path[-1] == len(target):
				if value is not undefined:
					target.append(value)
				elif path[-1] == len(target) - 1:
					target.pop()
				else:
					raise ValueError('trying to remove object from inside list')
			else:
				if value is not undefined:
					target[path[-1]] = value
				else:
					del target[path[-1]]
		elif obj[0] is __main__.Public:
			changes = __main__.Public
			__main__.Public = value
		elif obj[0] is __main__.Private:
			changes = __main__.Private
			__main__.Private = value
		else:
			raise AssertionError('BUG: invalid object for update')
		return changes
	def Public_update(self, path, value = undefined):
		changes = self._update([__main__.Public], path, value)
		# Connect only once.
		if __main__.Public['name'] == '':
			if not self._connected:
				self._connected = True
				# Join a game if we can.
				if len(__main__.Public['games']) > 0:
					if config['name'] in __main__.Public['games']:
						__main__.game.join(config['name'])
					else:
						__main__.game.join(__main__.Public['games'][0])
				else:
					# If not, create a new game.
					__main__.game.new(config['name'])
		else:
			if 'name' in changes and changes['name'] == '':
				# First connection.
				if hasattr(self._user, 'new_game'):
					self._user.new_game()
				elif not hasattr(self._user, 'update'):
					websocketd.log('No new_game or update defined')
				if len(__main__.Private) > 0 and hasattr(self._user, 'Private_update'):
					self._user.Private_update({})
				elif hasattr(self._user, 'update'):
					self._user.update()
			elif hasattr(self._user, 'Public_update'):
				self._user.Public_update(changes)
			elif hasattr(self._user, 'update'):
				self._user.update()
			else:
				websocketd.log('No Public_update or update defined')
	def Private_update(self, path, value = undefined):
		changes = self._update([__main__.Private], path, value)
		if __main__.Public['name'] != '':
			if hasattr(self._user, 'Private_update'):
				self._user.Private_update(changes)
			elif hasattr(self._user, 'update'):
				self._user.update()
			else:
				websocketd.log('No Private_update or update defined')
	def end(self, arg):
		if hasattr(self._user, 'end'):
			self._user.end(arg)
		else:
			websocketd.log('Game ended.  Result: {}'.format(arg))
			websocketd.endloop()
	def __getattr__(self, attr):
		def ret(*a, **ka):
			if not hasattr(self._user, attr):
				websocketd.log('Calling undefined {} {} {}'.format(attr, a, ka))
				return
			return getattr(self._user, attr)(*a, **ka)
		return ret

def run():
	global config
	config = fhs.module_get_config('game')
	fhs.is_game = True
	connection = websocketd.RPC('8891', AI, url = '?name=' + config['myname'], tls = False)
	websocketd.fgloop()

__main__.run = run
