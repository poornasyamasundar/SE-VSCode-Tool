import argparse
from ast import parse
from email.policy import default
import logging

from .server import server

logging.basicConfig(filename="pygls.log", level=logging.DEBUG, filemode='w')

def add_arguements(parser):
    parser.description = "python server"

    parser.add_argument(
        "--tcp", action="store_true",
        help = "Use TCP server"
    )
    parser.add_argument(
        "--ws", action="store_true",
        help = "Use WebSocket server"
    )
    parser.add_argument(
        "--host", default="127.0.0.1",
       help = "Bind to this address"
    )
    parser.add_argument(
        "--port", type=int, default=2087,
        help="Bind to this port"
    )

def main():
    parser = argparse.ArgumentParser()
    add_arguements(parser)
    args = parser.parse_args()

    if args.tcp:
        server.start_tcp(args.host, args.port)
    elif args.ws:
        server.start_ws(args.host, args.port)
    else:
        server.start_io()

if __name__ == '__main__':
    main()