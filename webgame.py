# Webgame module.

import websocketd
from websocketd import log
import fhs
import sys
import os
import time
import json
import __main__
import collections

fhs.module_init('webgame', {'port': 8891, 'tls': False})

server = None

class Shared_Object(collections.MutableMapping):
	def __init__(self, path, target, group):
		self.__dict__['_path'] = path
		self.__dict__['_target'] = target
		self.__dict__['_members'] = {}
		self.__dict__['_alive'] = False
		self.__dict__['_group'] = group
	def __setattr__(self, key, value):
		if key in self._members and isinstance(self._members[key], (Shared_Object, Shared_Array)):
			self._members[key]._die()
		self._members[key] = make_shared(self._path, self._target, key, value, send = self._alive, group = self._group)
	def __getattr__(self, key):
		return self._members[key]
	def __delattr__(self, key):
		make_shared(self._path, self._target, key, None, send = self._alive, group = self._group)
		if key in self._members and isinstance(self._members[key], (Shared_Object, Shared_Array)):
			self._members[key]._die()
		del self._members[key]
		if self.alive:
			path = self._path[1:] + [key]
			if self._target is None:
				assert self._path[0] == 'public'
				server.broadcast[self._group].public_update(path)
			elif self._path[0] == 'public':
				assert self._group in self.target._socket._groups
				self._target._socket.public_update.event(path)
			else:
				self._target._socket.private_update.event(path)
	def __getitem__(self, key):
		return getattr(self, key)
	def __setitem__(self, key, value):
		return setattr(self, key, value)
	def __delitem__(self, key):
		return delattr(self, key)
	def __len__(self):
		return len(self._members)
	def __iter__(self):
		yield from iter(self._members)
	def _live(self):
		self.__dict__['_alive'] = True
		for i in self._members:
			if isinstance(self._members[i], (Shared_Object, Shared_Array)):
				self._members[i]._live()
	def _die(self):
		self.__dict__['_alive'] = False
		for i in self._members:
			if isinstance(self._members[i], (Shared_Object, Shared_Array)):
				self._members[i]._die()
	def _json(self):
		ret = {}
		for k, v in self._members.items():
			if isinstance(v, (Shared_Object, Shared_Array)):
				ret[k] = v._json()
			else:
				ret[k] = v
		return ret

class Shared_Array(collections.MutableSequence):
	def __init__(self, path, target, group):
		self.path = path
		self.target = target
		self.data = []
		self.alive = False
		self.group = group
	def __setitem__(self, index, value):
		if index < 0:
			index += len(self.data)
		assert 0 <= index < len(self.data)
		if isinstance(self.data[index], (Shared_Object, Shared_Array)):
			self.data[index]._die()
		self.data[index] = make_shared(self.path, self.target, index, value, send = self.alive, group = self.group)
	def __getitem__(self, index):
		return self.data[index]
	def __delitem__(self, index):
		if index < 0:
			index += len(self.data)
		assert 0 <= index < len(self.data)
		if isinstance(self.data[index], (Shared_Object, Shared_Array)):
			self.data[index]._die()
		for i in range(index, len(self.data) - 1):
			self[i] = make_shared(self.path, self.target, i, self[i + 1], send = self.alive, group = self.group)
		self.data.pop()
		if self.alive:
			path = self.path[1:] + ['length']
			if self.target is None:
				assert self.path[0] == 'public'
				server.broadcast[self.group].public_update(path, len(self.data))
			elif self.path[0] == 'public':
				assert self.group in self.target._socket._groups
				self.target._socket.public_update.event(path, len(self.data))
			else:
				self.target._socket.private_update.event(path, len(self.data))
	def __len__(self):
		return len(self.data)
	def insert(self, index, obj):
		if index < 0:
			index += len(self.data)
		assert 0 <= index <= len(self.data)
		if index < len(self.data):
			self.data.append(make_shared(self.path, self.target, len(self.data), self.data[-1], send = False, group = self.group))
			for i in range(len(self.data) - 2, index, -1):
				if isinstance(self.data[i], (Shared_Object, Shared_Array)):
					self.data[i]._die()
				self.data[i] = make_shared(self.path, self.target, i, self[i - 1], send = False, group = self.group)
			self.data[index] = make_shared(self.path, self.target, index, obj, send = False, group = self.group)
			if self.target is None or self.target.connection is not None:
				broadcast_shared(self.target, self.path, self)
		else:
			self.data.append(make_shared(self.path, self.target, index, obj, send = self.alive, group = self.group))
	def _live(self):
		self.alive = True
		for i in self.data:
			if isinstance(i, (Shared_Object, Shared_Array)):
				i._live()
	def _die(self):
		self.alive = False
		for i in self.data:
			if isinstance(i, (Shared_Object, Shared_Array)):
				i._die()
	def _json(self):
		ret = []
		for v in self.data:
			if isinstance(v, (Shared_Object, Shared_Array)):
				ret.append(v._json())
			else:
				ret.append(v)
		return ret

def make_shared(parent_path, target, key, value, send, group):
	path = parent_path.copy()
	path.append(key)
	if isinstance(value, (tuple, list)):
		newvalue = Shared_Array(path, target, group)
		for i, x in enumerate(value):
			newvalue.append(make_shared(path, target, i, x, False, group))
		if send:
			newvalue._live()
			if target is None or target.connection is not None:
				broadcast_shared(target and target.connection, path, newvalue, group)
	elif isinstance(value, dict):
		newvalue = Shared_Object(path, target, group)
		for i in value:
			newvalue[i] = make_shared(path, target, i, value[i], False, group)
		if send:
			newvalue._live()
			if target is None or target.connection is not None:
				broadcast_shared(target and target.connection, path, newvalue, group)
	else:
		newvalue = value
		if send:
			if target is None or target.connection is not None:
				broadcast_shared(target and target.connection, path, newvalue, group)
	return newvalue

def broadcast_shared(target, path, value, group = None):
	if isinstance(value, Shared_Object):
		assert group is None or group is value._group
		group = value._group
		value = value._json()
	elif isinstance(value, Shared_Array):
		assert group is None or group is value.group
		group = value.group
		value = value._json()
	assert group is not None
	if target is None:
		assert path[0] == 'public'
		# Send public update to everyone.
		#log('broadcast %s %s' % (repr(path), repr(value)))
		server.broadcast[group].public_update(path[1:], value)
	else:
		if path[0] == 'public':
			assert group in target._socket._groups
			#log('public %s %s' % (repr(path), repr(value)))
			# Send public information to target.
			target._socket.public_update.event(path[1:], value)
		else:
			#log('private %s %s' % (repr(path), repr(value)))
			# Send private information for target that is controlling the correct player.
			target._socket.private_update.event(path[1:], value)

# Scheduled timeouts, stored as (absolute time, generator).
timeouts = []

# Programs to run without a game context.
queue = []

# All connections (both viewers and players).
connections = set()

# String to paste into javascript for loading asserts.
loader_js = None

# Generator type, for checking if things are generators.
generator_type = type((lambda: (yield))())

# Flag to allow quit() to stop the server.
running = True

# All currently running games.
instances = {}

# Title game instance.
title_game = None

# Commands that work always.
cmds = {}

class Player:
	pass

class Instance:
	def __init__(self, name, cls):
		self.game = cls()
		n = name
		i = 0
		while name in instances:
			name = '%s (%d)' % (n, i)
			i += 1
		instances[name] = self
		self.game.add_player = lambda: self.add_player()
		self.game.remove_player = lambda p: self.remove_player(p)
		# Generators which are waiting to be called, stored as (generator, arg) tuples.
		self.queue = []
		# Allowed commands at this time.  Keys are command names, values are tuples of
		# (function to call or int or sequence of ints) and (generator to resume, or None).
		# Ints are players that are allowed to use this command.
		self.cmds = {}
		# Initialize public variables.
		self.game.public = Shared_Object(['public'], None, name)
		self.game.public._live()
		self.game.public.name = name
		# Set up players.
		if cls is not Title:
			if not hasattr(self.game, 'min_players'):
				self.game.min_players = __main__.min_players
			if not hasattr(self.game, 'max_players'):
				self.game.max_players = __main__.max_players
			num_players = __main__.num_players or __main__.min_players
			title_game.game.public.games.append(name)
		else:
			num_players = 0
		self.game.players = []
		for p in range(num_players):
			self.game.add_player()
		# Start game.
		self.queue.append((self.game.run(), None))
		log("started new instance '%s'" % name)

	def close(self):
		log("stopped instance '%s'" % self.game.public.name)
		del instances[self.game.public.name]
		self.game.public._die()
		for p in self.game.players:
			p.private._die()
		title_game.game.public.games.remove(self.game.public.name)

	def run(self, now, f, arg):
		self.game.now = now
		if type(f) == generator_type:
			try:
				#log('sending %s' % repr(arg))
				cmd = f.send(arg)
			except StopIteration:
				#log('done')
				self.close()
				for c in connections:
					if c.instance != self:
						continue
					leave({'connection': c})
				return
		else:
			cmd = f(arg)
		#log('cmd = %s' % repr(cmd))
		if cmd is not None:
			# Convert cmd to dict if it isn't.
			if isinstance(cmd, str):
				cmd = {cmd: None}
			elif isinstance(cmd, (tuple, list)):
				def mkcmd(src):
					for c in src:
						if isinstance(c, str):
							yield (c, None)
						else:
							yield (None, c)
				cmd = {x: y for x, y in mkcmd(cmd)}
			#log('new cmd: %s' % repr(cmd))
			# Schedule new timeout.
			if None in cmd:
				timeouts.append((cmd.pop(None), (self, f)))
				timeouts.sort()
			# Add new commands.
			for c in cmd:
				assert c not in self.cmds
				self.cmds[c] = (cmd[c], f)

	def cleanup(self, f):
		for k in [x for x in self.cmds if self.cmds[x][1] is f]:
			self.cmds.pop(k)
		for t in [x for x in timeouts if x[1] is (self, f)]:
			timeouts.remove(t)

	def add_player(self):
		#log('%s %s %s' % (self.game.public.name, self.game.players, self.game.max_players))
		assert self.game.max_players is None or len(self.game.players) < self.game.max_players
		p = Player()
		p.connection = None
		p.private = Shared_Object(['private'], p, self.game.public.name)
		p.private._live()
		#log('appending %s' % p)
		self.game.players.append(p)
		return len(self.game.players) - 1
	
	def remove_player(self, p):
		assert len(self.game.players) > self.game.min_players
		assert p < len(self.game.players)
		if self.game.players[p].connection is not None:
			self.game.players[p].connection.num = None
			self.game.players[p].connection.game = None
			self.game.players[p].connection.socket.end_game.event()
			self.game.players[p].connection = None
		self.game.players[p].private._die()
		self.game.players.pop(p)

	# Call a function or generator, with arguments.
	# The return value is discarded.
	def launch(self, f, *a, **ka):
		fn = f(*a, **ka)
		# If it's a generator, add it to the queue.
		# If not, ignore the return value.
		if type(fn) == generator_type:
			self.queue.append((fn, None))

class Connection:
	def __init__(self, socket):
		self._socket = socket
		connections.add(self)
		self._socket.closed = self._closed
		self.instance = title_game
		self._socket._groups.add(title_game.game.public.name)
		self.num = None
		# Inform about state.
		broadcast_shared(self, ['public'], self.instance.game.public)
		broadcast_shared(self, ['private'], None, title_game.game.public.name)
	def _closed(self):
		if self.num is not None:
			self.instance.game.players[self.num].connection = None
			if __main__.autokill and all(p.connection is None for p in self.instance.game.players):
				# Last player left; destroy game.
				self.instance.close()
			self.num = None
		connections.remove(self)
	def __getattr__(self, attr):
		'''Allow usage of registered commands.'''
		if attr.startswith('_'):
			raise AttributeError('invalid attribute name for getattr')
		if attr in cmds:
			func, f = cmds[attr]
			instance = None
		elif self.instance is not None and attr in self.instance.cmds:
			func, f = self.instance.cmds[attr]
			instance = self.instance
		else:
			log('attribute not found: %s not in %s %s' % (attr, repr(cmds), repr(self.instance.cmds)))
			raise AttributeError('attribute %s not found' % attr)
		if isinstance(func, int):
			func = (func,)
		if isinstance(func, (tuple, list)):
			if self.num not in func:
				raise AttributeError('forbidden')
			func = None
		def wrap(*a, **ka):
			if instance is not None:
				instance.cleanup(f)
			websocketd.endloop()
			args = {'args': ka, 'connection': self, 'player': self.num, 'command': attr, 'nargs': len(a)}
			args['args'].update({i: x for i, x in enumerate(a)})
			if func is not None:
				ret = func(args)
			else:
				ret = None
			if f is not None:
				if instance is not None:
					instance.queue.append((f, args))
				else:
					queue.append((f, args))
			return ret
		return wrap

def page(connection): # {{{
	if any(connection.address.path == '/' + x for x in ('rpc.js', 'builders.js')):
		server.reply_js(connection, fhs.read_data(connection.address.path.rsplit('/', 1)[-1], text = False, packagename = 'python-websocketd').read())
	elif any(connection.address.path == '/' + x for x in ('admin.js', 'webgame.js', 'gl-matrix.js', 'mgrl.js')):
		def makeaudio(dirobj, dir):
			ret = []
			for f in os.listdir(dir):
				if os.path.splitext(f)[1][len(os.path.extsep):] not in ('wav', 'ogg', 'mp3'):
					continue
				if os.path.isdir(f):
					d = dirobj.copy()
					d.append(f)
					ret.extend(makeaudio(d, os.path.join(dir, f)))
				else:
					ret.append((dirobj, f, os.path.splitext(f)[0]))
			return ret
		audio = json.dumps(makeaudio([], fhs.read_data(os.path.join('html', 'assets', 'audio'), text = False, opened = False, dir = True))).encode('utf-8')
		if not __main__.have_3d:
			use_3d = False
		elif not __main__.have_2d:
			use_3d = True
		elif '2d' in connection.query:
			use_3d = False
		else:
			use_3d = True
		server.reply_js(connection, fhs.read_data(connection.address.path.rsplit('/', 1)[-1], text = False, packagename = 'python-webgame').read().replace(b'#3D#', b'true' if use_3d else b'false').replace(b'#LOAD#', loader_js).replace(b'#PREFIX#', (connection.prefix + '/').encode('utf-8')).replace(b'#AUDIO#', audio))
	elif any(connection.address.path == '/' + x for x in ('admin.css', 'webgame.css')):
		server.reply_css(connection, fhs.read_data(connection.address.path.rsplit('/', 1)[-1], text = False, packagename = 'python-webgame').read())
	elif connection.address.path == '/admin':
		server.reply_html(connection, fhs.read_data('admin.html', text = False, packagename = 'python-webgame').read().replace(b'#NAME#', __main__.name.encode('utf-8')).replace(b'#BASE#', (connection.prefix + '/').encode('utf-8')))
	elif connection.address.path == '/':
		files = []
		for d in connection.server.httpdirs:
			for f in os.listdir(d):
				if not f.endswith(os.extsep + 'js'):
					continue
				files.append(("<script type='application/javascript' src='%s'></script>" % f).encode('utf-8'))
		files.sort()
		server.reply_html(connection, fhs.read_data('webgame.html', text = False, packagename = 'python-webgame').read().replace(b'#NAME#', __main__.name.encode('utf-8')).replace(b'#BASE#', (connection.prefix + '/').encode('utf-8')).replace(b'#SOURCE#', b'\n\t\t'.join(files)).replace(b'#QUERY#', connection.address.query.encode('utf-8')))
	else:
		if 'name' in connection.query:
			connection.data['name'] = connection.query['name'][-1]
		websocketd.RPChttpd.page(server, connection)
# }}}

class Title:
	def __init__(self):
		self.min_players = 0
		self.max_players = 0
	def run(self):
		self.public.title = __main__.name
		self.public.games = []
		while True:
			cmd = (yield ('new', 'join', 'return', 'view'))
			connection = cmd['connection']
			command = cmd['command']
			num = connection.num
			#log('received title command %s' % cmd)
			if len(cmd['args']) < 1:
				log('no game name specified')
				continue
			if command == 'new':
				i = Instance(cmd['args'][0], __main__.Game)
				cmd['args'][0] = i.game.public.name
				command = 'join'	# fall through.
			if cmd['args'][0] not in instances:
				log("game doesn't exist")
				continue
			instance = instances[cmd['args'][0]]
			if command == 'join':
				for i, p in enumerate(instance.game.players):
					if p.connection is None:
						connection.num = i
						break
				else:
					if len(instance.game.players) < instance.game.max_players:
						connection.num = instance.game.add_player()
					else:
						log('no more players allowed')
						continue
				connection.instance = instance
				instance.game.players[connection.num].connection = connection
				connection._socket._groups.remove(self.public.name)
				connection._socket._groups.add(cmd['args'][0])
				broadcast_shared(connection, ['public'], connection.instance.game.public)
				broadcast_shared(connection, ['private'], connection.instance.game.players[connection.num].private)
			elif command == 'return':
				if len(cmd['args']) < 2 or cmd['args'][1] >= len(instance.game.players) or instance.game.players[cmd['args'][1]].connection is not None:
					log('invalid player number to return to')
					continue
				connection.instance = instance
				connection.num = cmd['args'][1]
				instance.game.players[cmd['args'][1]].connection = connection
				connection._socket._groups.remove(self.public.name)
				connection._socket._groups.add(cmd['args'][0])
				broadcast_shared(connection, ['public'], connection.instance.game.public)
				broadcast_shared(connection, ['private'], connection.instance.game.players[connection.num].private)
			elif command == 'view':
				connection.instance = instance
				connection._socket._groups.remove(self.public.name)
				connection._socket._groups.add(cmd['args'][0])
				broadcast_shared(connection, ['public'], connection.instance.public)
				broadcast_shared(connection, ['private'], None, connection.instance.game.name)
			else:
				log('impossible command')
				continue

def leave(args):
	connection = args['connection']
	if connection.instance is title_game:
		return
	if connection.num is not None:
		connection.instance.game.players[connection.num].connection = None
		if __main__.autokill and all(p.connection is None for p in connection.instance.game.players):
			# Last player left; destroy game.
			connection.instance.close()
	connection._socket._groups.remove(connection.instance.game.public.name)
	connection.instance = title_game
	connection._socket._groups.add(title_game.game.public.name)
	connection.num = None
	broadcast_shared(connection, ['public'], connection.instance.game.public)
	broadcast_shared(connection, ['private'], None, title_game.game.public.name)

# Main function to start a game.  Pass commands that always work, if any.
def Game(cmd = {}, title = Title):
	global server, loader_js, running, title_game, have_2d, have_3d
	# Set up the game name.
	if not hasattr(__main__, 'name') or __main__.name is None:
		__main__.name = os.path.basename(sys.argv[0]).capitalize()
	if not hasattr(__main__, 'autokill'):
		__main__.autokill = True
	if not hasattr(__main__, 'have_3d'):
		__main__.have_3d = False
	if not hasattr(__main__, 'have_2d'):
		__main__.have_2d = not __main__.have_3d
	# Fill in min and max if not specified.
	if hasattr(__main__, 'num_players'):
		assert isinstance(__main__.num_players, int)
		if not hasattr(__main__, 'min_players'):
			__main__.min_players = __main__.num_players
		if not hasattr(__main__, 'max_players'):
			__main__.max_players = __main__.num_players
	assert hasattr(__main__, 'min_players') and isinstance(__main__.min_players, int)
	assert hasattr(__main__, 'max_players') and __main__.max_players is None or (isinstance(__main__.max_players, int) and __main__.max_players >= __main__.min_players)
	# Build asset string for inserting in js.
	targets = []
	for d in ('img', 'jta', 'gani', 'audio', 'text'):
		p = os.path.join ('html', 'assets', d)
		if os.path.exists(p):
			targets.extend(f.encode('utf-8') for f in os.listdir(p) if not f.startswith('.') and not os.path.isdir(os.path.join(p, f)))
	if len(targets) > 0:
		loader_js = b'\n'.join(b"\tplease.load('" + f + b"');" for f in targets)
	else:
		loader_js = b'\twindow.dispatchEvent(new CustomEvent("mgrl_media_ready"));'
	# Set up commands.
	cmds['leave'] = (leave, None)
	for c in cmd:
		cmds[c] = (cmd[c], None)
	# Start up websockets server.
	if not fhs.initialized:
		fhs.init(__main__.name.lower(), {}, game = True)
	config = fhs.module_get_config('webgame')
	server = websocketd.RPChttpd(config['port'], Connection, tls = config['tls'], httpdirs = fhs.read_data('html', opened = False, multiple = True, dir = True))
	server.page = page
	server.handle_ext('png', 'image/png')
	server.handle_ext('jpg', 'image/jpeg')
	server.handle_ext('jpeg', 'image/jpeg')
	server.handle_ext('gif', 'image/gif')
	server.handle_ext('gani', 'text/plain')
	server.handle_ext('wav', 'audio/wav')
	server.handle_ext('ogg', 'audio/ogg')
	server.handle_ext('mp3', 'audio/mp3')
	server.handle_ext('jta', 'application/octet-stream')
	# Set up title page.
	title_game = Instance('', title)
	log('Game "%s" started' % __main__.name)
	# Main loop.
	while running:
		now = time.time()
		# Run all events for which the timeout has expired by now.
		while len(timeouts) > 0 and timeouts[0][0] < now:
			instance, f = timeouts.pop(0)[1]
			if f is not None:
				if instance is not None:
					instance.cleanup(f)
					instance.queue.append((f, None))
				else:
					queue.append((f, None))
			else:
				log('None timeout callback?')
		# Handle queue.
		while len(queue) > 0 or any(len(i.queue) > 0 for i in instances.values()):
			while len(queue) > 0:
				# Global commands must be functions, not generators, and cannot schedule new events.
				c, a = queue.pop(0)
				assert c(a) is None
			#log('running instance generators %s' % repr(instances))
			for i in tuple(instances.keys()):
				#log('> %s' % i)
				while i in instances and len(instances[i].queue) > 0:
					#log(': %s' % repr(instances[i].queue[0]))
					instances[i].run(now, *instances[i].queue.pop(0))
		# Wait for an event.
		#log('waiting for %s' % repr(cmds))
		websocketd.fgloop(None if len(timeouts) == 0 else timeouts[0][0] - now)
	# End of game.  Do anything to clean up?

def quit():
	global running
	running = False
	log('quit at user request')
