= Webgame
This is a system for hosting multi player games through a web server.

The main goals of this system are:

  - Easy to use for players, regardless of the OS that runs on their system. It can even be used on mobile devices. (But it drains the battery quite a bit.)
  - As easy as possible to create new games: the author should spend as much of their time as possible on the actual game (as opposed to the system that is required to run it).

== Installation

You need:

  - m.grl (https://github.com/aeva/m.grl)
  - python-fhs (https://github.com/wijnen/python-fhs)
  - python-network (https://github.com/wijnen/python-network)
  - python-websocketd (https://github.com/wijnen/python-websocketd)
  - a directory of games (you can use the games in tutorial/ for testing)

=== Method 1: Run from Source

  - Run make in the m.grl source.
  - Link mgrl.js from m.grl to html/
  - Link demos/gl-matrix.js from m.grl to html/
  - Link builders.js and rpc.js from python-websocketd to html/
  - Link the games directory to the source as games

=== Method 2: Install on System

  - Install webgame and webgame-update-games in the search path.
  - Copy all files in html/ to /usr/share/webgame/html/.
  - Copy all the files that are referenced in Method 1 to /usr/share/webgame/html/.
  - Copy the games directory to /usr/share/webgame/games/.
  - Set up the web server to access /usr/share/webgame/html as http(s)://<hostname>/webgame
  - Set up the web server to provide a virtual proxy from ws(s)://<hostname>/webgame/websocket to ws://localhost:8891/.
  - Run webgame as a system service at startup.

== Playing Games
Point a browser on the computer that runs webgame to http://localhost:8891 . On
other computers, use the hostname of the machine instead of localhost.

The recommended method for playing games, especially over the internet (as
opposed to a private network), is through the apache web server, with encrypted
connections. If it is set up as described in method 2 above, all players should
connect to https://<hostname>/webgame/.

== Adding New Games

To add a new game, add it to the games/ directory and run webgame-update-games.
This will update all generated information for all games that are installed in
the places where webgame will find them. (Because of this, make sure the games
directory is in the proper place before running webgame-update-games.)

To play the new game(s), webgame must be restarted.

== Removing a Game

To remove a game, simply remove its subdirectory from the games directory. Also
remove html/<gamename>, which is a link into the game directory.

After removal, webgame must be restarted.

== Creating a New Game
To create a new game, see the instructions in Creating-Games.md and/or browse
the examples under tutorial/.
