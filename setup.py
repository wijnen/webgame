#!/usr/bin/env python

import distutils.core
distutils.core.setup (
		name = 'webgame',
		packages = ['webgame', 'webgame.client', 'webgame.server'],
		version = '0.1',
		description = 'web based game creator',
		author = 'Bas Wijnen',
		author_email = 'wijnen@debian.org',
		)
