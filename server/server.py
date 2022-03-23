from pygls.server import LanguageServer

class PythonLanguageServer(LanguageServer):
    HELLO_WORLD = 'helloPoorna'

    def __init__(self):
        super().__init__()


server = PythonLanguageServer()

@server.command(PythonLanguageServer.HELLO_WORLD)
def helloWorld(ls:PythonLanguageServer, *args):
    ls.show_message("hello this is poorna")