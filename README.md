# Docker port forwarder

Automatically forwards all remote ports from a docker-machine to the localhost.
Very useful on e.g. OS X where the docker instance can't be run locally.

Docker port forwarder will forward any port on the docker instance so that you
can utilize the docker services as if they where running on your local machine.

## Getting started

Export docker-machine variables to shell (replace `default` with the name fo your docker-machine)

    $ eval "$(docker-machine env default)"
  
Install `docker-pf` (you need [nodejs](https://nodejs.org/)):

    $ npm install -g docker-pf

Start it

    $ docker-pf

Or if you want to run it in background

    $ docker-pf 0<&- &>/dev/null &
