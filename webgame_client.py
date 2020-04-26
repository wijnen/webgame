# webgame_client.py - module for writing a webgame AI client.
# vim: set fileencoding=utf-8 :

'''
This module defines the AI class, which conects to a webgame server. It defines
the run() function in the main program, which should be called as the only
action (optionally, configuration can be parsed).

Several variables are created in the main namespace:
	game: the socket connecting to the game server
	name: the username of this connection
	myname: the player's name
	mynum: the player's number
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
from urllib.parse import quote
import random

# Make these global options, not module options.
fhs.option('port', 'server name and port', default = '8891')
fhs.option('name', 'player name', default = '')
fhs.option('game', 'game name to join', default = '')

if not hasattr(__main__, 'names'):
	__main__.names = ('Thorin', 'Gloin', 'Óin', 'Ori', 'Nori', 'Dori', 'Dwalin', 'Balin', 'Kili', 'Fili', 'Bifur', 'Bofur', 'Bombur', 'Bilbo', 'Gandalf', 'Sauron', 'Elrond', 'Gollum', 'Beorn', 'Smaug', 'Bard')

class Undefined:
	def __bool__(self):
		return False
undefined = Undefined()

def _is_shared(obj):
	return isinstance(obj, (Shared_Array, Shared_Object))

def _make_shared(obj):
	if _is_shared(obj):
		return obj
	if isinstance(obj, list):
		return Shared_Array(obj)
	if isinstance(obj, dict):
		return Shared_Object(obj)
	return obj

class Shared_Array(list):
	'''Receiver of the server's shared data.'''
	def __init__(self, base = None):
		if base is not None:
			self.extend((None,) * len(base))
			for i, v in enumerate(base):
				super().__setitem__(i, _make_shared(v))
	def __setitem__(self, key, value):
		assert isinstance(key, int)
		super().__setitem__(key, _make_shared(value))

class Shared_Object(dict):
	'''Receiver of the server's shared data.
	Members can be retrieved both as items and as attributes.'''
	def __init__(self, base = None):
		if base is not None:
			for key in base:
				self[key] = base[key]
	def __getattr__(self, attr):
		return self[attr]
	def __setattr__(self, attr, value):
		self[attr] = value
	def __setitem__(self, key, value):
		super().__setitem__(key, _make_shared(value))

class AI:
	def __init__(self, socket):
		__main__.game = socket
		self._connected = False
		socket.closed = disconnect
		self._updating = False
		self._updates = [None, None]
	def id(self, name, num):
		__main__.myname = name
		__main__.mynum = num
	def webgame_init(self, languages):
		__main__.Public = Shared_Object()
		__main__.Private = Shared_Object()
		self._user = __main__.AI()
	def _make_copy(self, obj):
		if isinstance(obj, list):
			return [self._make_copy(x) for x in obj]
		if isinstance(obj, dict):
			return {x: self._make_copy(obj[x]) for x in obj}
		return obj
	def _do_public_update(self, changes):
		if not self._updating:
			self._updating = True
			if hasattr(self._user, 'Public_update'):
				self._user.Public_update(changes)
			elif hasattr(self._user, 'update'):
				self._user.update()
			else:
				websocketd.log('No Public_update or update defined')
			self._updating = False
			self._finish_update()
		else:
			if hasattr(self._user, 'Public_update') or hasattr(self._user, 'update'):
				if self._updates[0] is None:
					self._updates[0] = self._make_copy(__main__.Public)
			else:
				websocketd.log('No Public_update or update defined')
	def _do_private_update(self, changes):
		if not self._updating:
			self._updating = True
			if hasattr(self._user, 'Private_update'):
				self._user.Private_update(changes)
			elif hasattr(self._user, 'update'):
				self._user.update()
			else:
				websocketd.log('No Private_update or update defined')
			self._updating = False
			self._finish_update()
		else:
			if hasattr(self._user, 'Private_update') or hasattr(self._user, 'update'):
				if self._updates[1] is None:
					self._updates[1] = self._make_copy(__main__.Private)
			else:
				websocketd.log('No Private_update or update defined')
	def _finish_update(self):
		'''Check if there are pending updates, and handle them if there are.
		registered changes files must be merged.'''
		assert not self._updating
		if self._updates[0] is not None:
			changes = {}
			self._make_changes(self._updates[0], __main__.Public, changes, [])
			self._updates[0] = None
			self._do_public_update(changes)
		if self._updates[1] is not None:
			changes = {}
			self._make_changes(self._updates[1], __main__.Private, changes, [])
			self._updates[1] = None
			self._do_private_update(changes)
	def _make_changes(self, obj, value, changes, path):
		#websocketd.log('make changes at path {}, set {} to {}'.format(path, obj, value))
		if not isinstance(value, (dict, list)):
			# This is a leaf node. Check if it should be recorded.
			c = changes
			if obj != value:
				# It needs to be recorded. Add path to changes.
				for p in path[:-1]:
					if p not in c:
						c[p] = {}
					c = c[p]
				if (isinstance(obj, dict) and path[-1] in obj) or (isinstance(obj, list) and path[-1] < len(obj)):
					# This is an object in a dict or list; record old value.
					c[path[-1]] = obj[path[-1]]
				else:
					# This object didn't exist; record that.
					c[path[-1]] = undefined
			return
		obj = obj[path[-1]] if obj and len(path) > 0 and path[-1] in obj else undefined
		# Fill changes based on value.
		if isinstance(value, dict):
			# Value is a dict; recursively fill changes.
			for v in value:
				path.append(v)
				self._make_changes(obj[v] if obj and v in obj else undefined, value[v], changes, path)
				path.pop()
		else:
			# Value is a list; recursively fill changes.
			for i, v in enumerate(value):
				path.append(i)
				self._make_changes(obj[i] if obj and i < len(obj) else undefined, v, changes, path)
				path.pop()
		# Fill changes based on obj.
		if isinstance(obj, dict):
			for v in obj:
				# Ignore parts that have been filled by value.
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
			__main__.Public = _make_shared(value)
		elif obj[0] is __main__.Private:
			changes = __main__.Private
			__main__.Private = _make_shared(value)
		else:
			raise AssertionError('BUG: invalid object for update')
		return changes
	def Public_update(self, path, value = undefined):
		changes = self._update([__main__.Public], path, value)
		# Connect only once.
		if __main__.Public.name == '':
			packagename = __main__.Public.title.lower()
			if not self._connected:
				self._connected = True
				# Join a game if we can.
				if len(__main__.Public.games) > 0:
					if config['game'] in __main__.Public['games']:
						__main__.game.join(config['game'])
					else:
						games = list(__main__.Public.games.keys())
						games.sort()
						__main__.game.join(games[0])
				else:
					# If not, create a new game.
					__main__.game.new(config['game'] or 'started by ai')
					__main__.game.admin('release')
			elif 'name' in changes:
				# We have been kicked out of the game.
				websocketd.endloop()
		else:
			if 'name' in changes and changes['name'] == '':
				# First connection.
				if hasattr(self._user, 'new_game'):
					self._user.new_game()
				elif not hasattr(self._user, 'update'):
					websocketd.log('No new_game or update defined')
				if len(__main__.Private) > 0 and hasattr(self._user, 'Private_update'):
					# Make update with everything undefined.
					private_changes = {}
					self._make_changes({}, __main__.Private, private_changes, [])
					self._do_private_update(private_changes)
			self._do_public_update(changes)
	def Private_update(self, path, value = undefined):
		changes = self._update([__main__.Private], path, value)
		if __main__.Public['name'] != '':
			self._do_private_update(changes)
	def end(self, arg):
		if hasattr(self._user, 'end'):
			self._user.end(arg)
		else:
			websocketd.log('Game ended.  Result: {}'.format(arg))
			websocketd.endloop()
	def chat(self, src, message):
		log('Chat from %s: %s' % (src, message))
		if hasattr(self._user, 'chat'):
			self._user.chat(src, message)
	def __getattr__(self, attr):
		def ret(*a, **ka):
			if not hasattr(self._user, attr):
				websocketd.log('Calling undefined {} {} {}'.format(attr, a, ka))
				return
			return getattr(self._user, attr)(*a, **ka)
		return ret

def disconnect(socket = None, data = None):
	'''Handle socket disconnect'''
	websocketd.log('socket disconnected')
	websocketd.endloop()

def run():
	global config
	config = fhs.get_config()
	fhs.is_game = True
	name = config['name'] or random.choice(__main__.names)
	connection = websocketd.RPC(config['port'], AI, url = '?name=' + quote(name), tls = False, disconnect_cb = disconnect)
	websocketd.fgloop()

__main__.run = run
