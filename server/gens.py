from scipy import spatial
import gensim.downloader as api
import numpy as np

# choose from multiple models https://github.com/RaRe-Technologies/gensim-data
model = api.load("glove-wiki-gigaword-300")

s0 = 'Add two integers'
s1 = 'sum of two numbers'
s2 = 'Microsoft is owned by Bill gates'
s3 = 'How to learn japanese'

descriptions = [s0, s1, s2, s3]


def preprocess(s):
    return [i.lower() for i in s.split()]


def get_vector(s):
    return np.sum(np.array([model[i] for i in preprocess(s)]), axis=0)


def get_similarity(query, descriptions):
    results = []
    print(descriptions, query)
    for i in range(len(descriptions)):
        d = descriptions[i]
        results.append(
            [1 - spatial.distance.cosine(get_vector(query), get_vector(d)), i])
    results.sort(key=lambda x: -x[0])
    print(results)

print("ready")
get_similarity("addition", descriptions)
