# Overview of yield expression arguments:

Syntactic sugar: some arguments are shorter versions of more complete arguments. Those are:

<table>
<tr><th>definition</th>	<th>example</th>	<th>long form</th>			<th>purpose</th>			</tr>
<tr><th>number</th>	<td>5</td>		<td>{None: 5}</td>			<td>delay</td>				</tr>
<tr><th>string</th>	<td>'move'</td>		<td>{'move': None}</td>			<td>command for all players</td>	</tr>
<tr><th>task</th>	<td>taskvariable</td>	<td>{taskvariable: None}</td>		<td>wait for task completion</td>	</tr>
<tr><th>sequence</th>	<td>['move', 5]</td>	<td>{'move': None, None: 5}</td>	<td>combination of the above</td>	</tr>
</table>

After the above transformations, the argument is always a dict. There are
several options for the keys of this dict, with their own requirements on the
values. Each key-value pair defines an option for waking the task.

- **Key**: None<br/>
	**Value**: number<br/>
	**Purpose**: timeout; if task has not been woken up before this time, it will wake
		up anyway. The time can be an absolute time (in seconds, where
		time.time() is now, which is also available as self.now) or a delay in
		seconds (no longer than 1 year).

- **Key**: str<br/>
	**Value**: int, sequence of ints, or None<br/>
	**Purpose**: one or more players can use a command; no argument checking. If value
		is an int, only that player may use the command. With a sequence, any
		player in the sequence may use the command. If it is None, any player
		may use the command.

- **Key**: (str, str)<br/>
	**Value**: same as above<br/>
	**Purpose**: same as above, with argument type checking. Every character in the
		second string defines a required argument. optional arguments are not
		supported (the game needs to do its own argument checks if those are
		needed). Argument types are: 'i': int, 's': str, 'f': float, 'b': bool,
		'*': any.

- **Key**: (str, ((str, type), ...))<br/>
	**Value**: same as above<br/>
	**Purpose**: same as above, with argument names. The (str, type) sequences define
		one argument each. The str is the name of the argument, which may be
		passed as a keyword argument (in any order, as always). The type is one
		of (int, str, float, bool, None). A type of None means any type is
		allowed. The return value allows using the argument names for
		retrieving the values that were given by the client.

- **Key**: task<br/>
	**Value**: None<br/>
	**Purpose**: wait for a task (that was previously created with launch()) to finish.
		When this is the cause of waking up, the return value of the task is in
		the 'args' item.
