from pygls.server import LanguageServer
from whoosh.fields import Schema, TEXT
from whoosh import index
import os, os.path
from whoosh import qparser, query, highlight
from whoosh.analysis import StemmingAnalyzer

class PythonLanguageServer(LanguageServer):
    HELLO_WORLD = 'helloPoorna'

    def __init__(self):
        super().__init__()


server = PythonLanguageServer()

@server.command(PythonLanguageServer.HELLO_WORLD)
def helloWorld(ls:PythonLanguageServer, *args):
    #print(args) 
    #print(args[0][0])
    #path = args[0][0]
    print(args)
    definitions = args[0][1]
    print(definitions)
    print(args[0][0])
    print(args[0][2])
    #checking(path)
    results = getResults(args[0][0], definitions, args[0][2])
    print(results)
    ls.show_message("hello this is poorna")
    return results

def getResults(path, definitions, searchQuery):
    print("Entered checking")
    stem_ana = StemmingAnalyzer()
    schema = Schema(title=TEXT(analyzer=stem_ana, stored=True), content=TEXT(analyzer = stem_ana, stored=True))

    if not os.path.exists(path):
        os.mkdir(path)
    
    ix = index.create_in(path, schema)
    writer = ix.writer()

    for i in range(len(definitions)):
        if( i % 2 == 0 ):
            writer.add_document(title=definitions[i], content=definitions[i+1])

    writer.commit()
    print("doc count = ", ix.doc_count())
    qp = qparser.MultifieldParser(["content", "title"], schema=schema, termclass=query.Variations, group = qparser.OrGroup)
    print(searchQuery)
    q = qp.parse(searchQuery)

    result = []    
    with ix.searcher() as s:
        results = s.search(q, terms=True, limit=10)
        print("searc results:")
        print(results[0:10])
        results.formatter = highlight.UppercaseFormatter()
        results.fragmenter.maxchars = 30
        results.fragmenter.surround = 30
        for i in range(len(results)):
            if( i == 4 ):
                break
            result.append(results[i]["title"])
            if( results[i].highlights("content") != ''):
                result.append(results[i].highlights("content"))
            else:
                result.append(results[i]["content"])
    return result