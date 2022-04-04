from urllib.request import pathname2url
from pygls.server import LanguageServer
from whoosh.fields import Schema, TEXT
from whoosh import index
import os
import os.path
from whoosh import qparser, query, highlight
from whoosh.analysis import StemmingAnalyzer

import os
import json
from transformers import RobertaConfig, RobertaModel, RobertaTokenizer
from torch.utils.data import TensorDataset, DataLoader, SequentialSampler

import torch
import torch.nn as nn


class Seq2Seq(nn.Module):
    """
    Build Seqence-to-Sequence.

    Parameters:

    * `encoder`- encoder of seq2seq model. e.g. roberta
    * `decoder`- decoder of seq2seq model. e.g. transformer
    * `config`- configuration of encoder model.
    * `beam_size`- beam size for beam search.
    * `max_length`- max length of target for beam search.
    * `sos_id`- start of symbol ids in target for beam search.
    * `eos_id`- end of symbol ids in target for beam search.
    """

    def __init__(
        self,
        encoder,
        decoder,
        config,
        beam_size=None,
        max_length=None,
        sos_id=None,
        eos_id=None,
    ):
        super(Seq2Seq, self).__init__()
        self.encoder = encoder
        self.decoder = decoder
        self.config = config
        self.register_buffer("bias", torch.tril(torch.ones(2048, 2048)))
        self.dense = nn.Linear(config.hidden_size, config.hidden_size)
        self.lm_head = nn.Linear(
            config.hidden_size, config.vocab_size, bias=False)
        self.lsm = nn.LogSoftmax(dim=-1)
        self.tie_weights()

        self.beam_size = beam_size
        self.max_length = max_length
        self.sos_id = sos_id
        self.eos_id = eos_id

    def _tie_or_clone_weights(self, first_module, second_module):
        """Tie or clone module weights depending of weither we are using TorchScript or not"""
        if self.config.torchscript:
            first_module.weight = nn.Parameter(second_module.weight.clone())
        else:
            first_module.weight = second_module.weight

    def tie_weights(self):
        """Make sure we are sharing the input and output embeddings.
        Export to TorchScript can't handle parameter sharing so we are cloning them instead.
        """
        self._tie_or_clone_weights(
            self.lm_head, self.encoder.embeddings.word_embeddings
        )

    def forward(
        self,
        source_ids=None,
        source_mask=None,
        target_ids=None,
        target_mask=None,
        args=None,
    ):
        outputs = self.encoder(source_ids, attention_mask=source_mask)
        encoder_output = outputs[0].permute([1, 0, 2]).contiguous()
        if target_ids is not None:
            attn_mask = -1e4 * (
                1 - self.bias[: target_ids.shape[1], : target_ids.shape[1]]
            )
            tgt_embeddings = (
                self.encoder.embeddings(target_ids).permute(
                    [1, 0, 2]).contiguous()
            )
            out = self.decoder(
                tgt_embeddings,
                encoder_output,
                tgt_mask=attn_mask,
                memory_key_padding_mask=(1 - source_mask).bool(),
            )
            hidden_states = torch.tanh(self.dense(
                out)).permute([1, 0, 2]).contiguous()
            lm_logits = self.lm_head(hidden_states)
            # Shift so that tokens < n predict n
            active_loss = target_mask[..., 1:].ne(0).view(-1) == 1
            shift_logits = lm_logits[..., :-1, :].contiguous()
            shift_labels = target_ids[..., 1:].contiguous()
            # Flatten the tokens
            loss_fct = nn.CrossEntropyLoss(ignore_index=-1)
            loss = loss_fct(
                shift_logits.view(-1, shift_logits.size(-1))[active_loss],
                shift_labels.view(-1)[active_loss],
            )

            outputs = loss, loss * active_loss.sum(), active_loss.sum()
            return outputs
        else:
            # Predict
            preds = []
            if source_ids.device.type == "cuda":
                zero = torch.cuda.LongTensor(1).fill_(0)
            elif source_ids.device.type == "cpu":
                zero = torch.LongTensor(1).fill_(0)
            for i in range(source_ids.shape[0]):
                context = encoder_output[:, i: i + 1]
                context_mask = source_mask[i: i + 1, :]
                beam = Beam(
                    self.beam_size,
                    self.sos_id,
                    self.eos_id,
                    device=source_ids.device.type,
                )
                input_ids = beam.getCurrentState()
                context = context.repeat(1, self.beam_size, 1)
                context_mask = context_mask.repeat(self.beam_size, 1)
                for _ in range(self.max_length):
                    if beam.done():
                        break
                    attn_mask = -1e4 * (
                        1 - self.bias[: input_ids.shape[1],
                                      : input_ids.shape[1]]
                    )
                    tgt_embeddings = (
                        self.encoder.embeddings(input_ids)
                        .permute([1, 0, 2])
                        .contiguous()
                    )
                    out = self.decoder(
                        tgt_embeddings,
                        context,
                        tgt_mask=attn_mask,
                        memory_key_padding_mask=(1 - context_mask).bool(),
                    )
                    out = torch.tanh(self.dense(out))
                    hidden_states = out.permute(
                        [1, 0, 2]).contiguous()[:, -1, :]
                    out = self.lsm(self.lm_head(hidden_states)).data
                    beam.advance(out)
                    input_ids.data.copy_(
                        input_ids.data.index_select(0, beam.getCurrentOrigin())
                    )
                    input_ids = torch.cat(
                        (input_ids, beam.getCurrentState()), -1)
                hyp = beam.getHyp(beam.getFinal())
                pred = beam.buildTargetTokens(hyp)[: self.beam_size]
                pred = [
                    torch.cat(
                        [x.view(-1) for x in p] + [zero] *
                        (self.max_length - len(p))
                    ).view(1, -1)
                    for p in pred
                ]
                preds.append(torch.cat(pred, 0).unsqueeze(0))

            preds = torch.cat(preds, 0)
            return preds


class Beam(object):
    def __init__(self, size, sos, eos, device):
        self.size = size
        if device == "cuda":
            self.tt = torch.cuda
        elif device == "cpu":
            self.tt = torch
        # The score for each translation on the beam.
        self.scores = self.tt.FloatTensor(size).zero_()
        # The backpointers at each time-step.
        self.prevKs = []
        # The outputs at each time-step.
        self.nextYs = [self.tt.LongTensor(size).fill_(0)]
        self.nextYs[0][0] = sos
        # Has EOS topped the beam yet.
        self._eos = eos
        self.eosTop = False
        # Time and k pair for finished.
        self.finished = []

    def getCurrentState(self):
        "Get the outputs for the current timestep."
        batch = self.tt.LongTensor(self.nextYs[-1]).view(-1, 1)
        return batch

    def getCurrentOrigin(self):
        "Get the backpointers for the current timestep."
        return self.prevKs[-1]

    def advance(self, wordLk):
        """
        Given prob over words for every last beam `wordLk` and attention
        `attnOut`: Compute and update the beam search.

        Parameters:

        * `wordLk`- probs of advancing from the last step (K x words)
        * `attnOut`- attention at the last step

        Returns: True if beam search is complete.
        """
        numWords = wordLk.size(1)

        # Sum the previous scores.
        if len(self.prevKs) > 0:
            beamLk = wordLk + self.scores.unsqueeze(1).expand_as(wordLk)

            # Don't let EOS have children.
            for i in range(self.nextYs[-1].size(0)):
                if self.nextYs[-1][i] == self._eos:
                    beamLk[i] = -1e20
        else:
            beamLk = wordLk[0]
        flatBeamLk = beamLk.view(-1)
        bestScores, bestScoresId = flatBeamLk.topk(self.size, 0, True, True)

        self.scores = bestScores

        # bestScoresId is flattened beam x word array, so calculate which
        # word and beam each score came from
        prevK = bestScoresId // numWords
        self.prevKs.append(prevK)
        self.nextYs.append((bestScoresId - prevK * numWords))

        for i in range(self.nextYs[-1].size(0)):
            if self.nextYs[-1][i] == self._eos:
                s = self.scores[i]
                self.finished.append((s, len(self.nextYs) - 1, i))

        # End condition is when top-of-beam is EOS and no global score.
        if self.nextYs[-1][0] == self._eos:
            self.eosTop = True

    def done(self):
        return self.eosTop and len(self.finished) >= self.size

    def getFinal(self):
        if len(self.finished) == 0:
            self.finished.append((self.scores[0], len(self.nextYs) - 1, 0))
        self.finished.sort(key=lambda a: -a[0])
        if len(self.finished) != self.size:
            unfinished = []
            for i in range(self.nextYs[-1].size(0)):
                if self.nextYs[-1][i] != self._eos:
                    s = self.scores[i]
                    unfinished.append((s, len(self.nextYs) - 1, i))
            unfinished.sort(key=lambda a: -a[0])
            self.finished += unfinished[: self.size - len(self.finished)]
        return self.finished[: self.size]

    def getHyp(self, beam_res):
        """
        Walk back to construct the full hypothesis.
        """
        hyps = []
        for _, timestep, k in beam_res:
            hyp = []
            for j in range(len(self.prevKs[:timestep]) - 1, -1, -1):
                hyp.append(self.nextYs[j + 1][k])
                k = self.prevKs[j][k]
            hyps.append(hyp[::-1])
        return hyps

    def buildTargetTokens(self, preds):
        sentence = []
        for pred in preds:
            tokens = []
            for tok in pred:
                if tok == self._eos:
                    break
                tokens.append(tok)
            sentence.append(tokens)
        return sentence

# Copyright 2020-present Tae Hwan Jung
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.


class Example(object):
    """A single training/test example."""

    def __init__(
        self,
        source,
        target,
    ):
        self.source = source
        self.target = target


class InputFeatures(object):
    """A single training/test features for a example."""

    def __init__(
        self,
        example_id,
        source_ids,
        target_ids,
        source_mask,
        target_mask,
    ):
        self.example_id = example_id
        self.source_ids = source_ids
        self.target_ids = target_ids
        self.source_mask = source_mask
        self.target_mask = target_mask


def convert_examples_to_features(examples, tokenizer, stage=None):
    features = []
    for example_index, example in enumerate(examples):
        # source
        source_tokens = tokenizer.tokenize(example.source)[: 256 - 2]
        source_tokens = [tokenizer.cls_token] + \
            source_tokens + [tokenizer.sep_token]
        source_ids = tokenizer.convert_tokens_to_ids(source_tokens)
        source_mask = [1] * (len(source_tokens))
        padding_length = 256 - len(source_ids)
        source_ids += [tokenizer.pad_token_id] * padding_length
        source_mask += [0] * padding_length

        # target
        if stage == "test":
            target_tokens = tokenizer.tokenize("None")
        else:
            target_tokens = tokenizer.tokenize(example.target)[
                : 128 - 2
            ]
        target_tokens = [tokenizer.cls_token] + \
            target_tokens + [tokenizer.sep_token]
        target_ids = tokenizer.convert_tokens_to_ids(target_tokens)
        target_mask = [1] * len(target_ids)
        padding_length = 128 - len(target_ids)
        target_ids += [tokenizer.pad_token_id] * padding_length
        target_mask += [0] * padding_length

        features.append(
            InputFeatures(
                example_index,
                source_ids,
                target_ids,
                source_mask,
                target_mask,
            )
        )
    return features


# We are defining all the needed functions here.
def inference(data, model, tokenizer):
    # Calculate bleu
    eval_sampler = SequentialSampler(data)
    eval_dataloader = DataLoader(
        data, sampler=eval_sampler, batch_size=len(data))

    model.eval()
    p = []
    for batch in eval_dataloader:
        batch = tuple(t.to('cpu') for t in batch)
        source_ids, source_mask = batch
        with torch.no_grad():
            preds = model(source_ids=source_ids, source_mask=source_mask)
            for pred in preds:
                t = pred[0].cpu().numpy()
                t = list(t)
                if 0 in t:
                    t = t[: t.index(0)]
                text = tokenizer.decode(t, clean_up_tokenization_spaces=False)
                p.append(text)
    return (p, source_ids.shape[-1])


def get_features(examples, tokenizer):
    features = convert_examples_to_features(
        examples, tokenizer, stage="test"
    )
    all_source_ids = torch.tensor(
        [f.source_ids[: 256] for f in features], dtype=torch.long
    )
    all_source_mask = torch.tensor(
        [f.source_mask[: 256] for f in features], dtype=torch.long
    )
    return TensorDataset(all_source_ids, all_source_mask)


def build_model(model_class, config, tokenizer):
    encoder = model_class(config=config)
    decoder_layer = nn.TransformerDecoderLayer(
        d_model=config.hidden_size, nhead=config.num_attention_heads
    )
    decoder = nn.TransformerDecoder(decoder_layer, num_layers=6)
    model = Seq2Seq(
        encoder=encoder,
        decoder=decoder,
        config=config,
        beam_size=10,
        max_length=128,
        sos_id=tokenizer.cls_token_id,
        eos_id=tokenizer.sep_token_id,
    )

    print("current files", os.listdir())
    model.load_state_dict(
        torch.load(
            "server/pytorch_model.bin",
            map_location=torch.device("cpu"),
        ),
        strict=False,
    )
    return model


class PythonLanguageServer(LanguageServer):
    GET_SEARCH_RESULTS = 'ACS-python.getSearchResults'
    FETCH_SUMMARY = 'ACS-python.fetchSummary'

    def __init__(self):
        super().__init__()


server = PythonLanguageServer()


@server.command(PythonLanguageServer.GET_SEARCH_RESULTS)
def getSummary(ls: PythonLanguageServer, *args):
    definitions = args[0][1]
    results = getResults(args[0][0], definitions, args[0][2])
    return results


@server.command(PythonLanguageServer.FETCH_SUMMARY)
def fetchSummary(ls: PythonLanguageServer, *args):
    config = RobertaConfig.from_pretrained("microsoft/codebert-base")
    tokenizer = RobertaTokenizer.from_pretrained(
        "microsoft/codebert-base", do_lower_case=False)
    model = build_model(model_class=RobertaModel,
                        config=config, tokenizer=tokenizer).to('cpu')

    print("ARGS = ", args)
    print("code got for generating summary is ", args[0][0])
    print("args[0] ", args[0])
    example = [Example(source=args[0][0], target=None)]
    summary, length = inference(get_features(
        example, tokenizer), model, tokenizer)
    print("Summary generated is:", summary)
    return summary


def getResults(pathname, definitions, searchQuery):
    stem_ana = StemmingAnalyzer()
    schema = Schema(title=TEXT(analyzer=stem_ana, stored=True),
                    content=TEXT(analyzer=stem_ana, stored=True))

    print("Path name is ", pathname)
    if not os.path.exists(pathname):
        os.mkdir(pathname)

    ix = index.create_in(pathname, schema)
    writer = ix.writer()

    for i in range(len(definitions)):
        if(i % 2 == 0):
            writer.add_document(title=definitions[i], content=definitions[i+1])

    writer.commit()
    qp = qparser.MultifieldParser(
        ["content", "title"], schema=schema, termclass=query.Variations, group=qparser.OrGroup)
    q = qp.parse(searchQuery)

    result = []
    with ix.searcher() as s:
        results = s.search(q, terms=True, limit=10)
        results.formatter = highlight.UppercaseFormatter()
        results.fragmenter.maxchars = 30
        results.fragmenter.surround = 30
        for i in range(len(results)):
            if(i == 4):
                break
            result.append(results[i]["title"])
            if(results[i].highlights("content") != ''):
                result.append(results[i].highlights("content"))
            else:
                result.append(results[i]["content"])
    return result
