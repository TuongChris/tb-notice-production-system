"""Offline structural contract tests; not Prisma/MySQL/server tests."""
from pathlib import Path
import json, re, sys
from jsonschema import Draft202012Validator, FormatChecker
R=Path(__file__).resolve().parents[1]
b=json.loads((R/'contracts/api-schemas.json').read_text())
o=json.loads((R/'contracts/openapi.json').read_text())
c=json.loads((R/'contracts/model-catalog.json').read_text())
results=[]
def ok(name, condition, detail=''):
 results.append({'name':name,'passed':bool(condition),'detail':detail})
def validate(name,value):
 root={**b,'$ref':'#/$defs/'+name}
 return list(Draft202012Validator(root,format_checker=FormatChecker()).iter_errors(value))
Draft202012Validator.check_schema(b);ok('JSON Schema 2020-12 bundle well-formed',True)
# Every internal OpenAPI JSON Pointer resolves.
refs=[]
def walk(v):
 if isinstance(v,dict):
  if '$ref' in v:refs.append(v['$ref'])
  for x in v.values():walk(x)
 elif isinstance(v,list):
  for x in v:walk(x)
walk(o)
for p in set(refs):
 assert p.startswith('#/'),p
 v=o
 for token in p[2:].split('/'):v=v[token.replace('~1','/').replace('~0','~')]
ok('All internal OpenAPI refs resolve',True,f'{len(set(refs))} unique references')
ops=[(p,m,x) for p,v in o['paths'].items() for m,x in v.items()]
ids=[x['operationId'] for _,_,x in ops]
ok('Operation IDs unique',len(ids)==len(set(ids)))
ok('Path parameter definitions complete',all(set(re.findall(r'\{([^}]+)\}',p))=={a['name'] for a in x['parameters'] if a.get('in')=='path'} for p,m,x in ops))
ok('No send/sign/G7 mutation route',all(not any(t in p.split('/') for t in ['send','sign','submit','g7','adopt']) for p,m,x in ops))
ok('No candidate body PATCH',not any(m=='patch' and p.startswith('/candidates') for p,m,x in ops))
ok('Private ops require session',all(x['security'] for p,m,x in ops if p not in ['/health','/auth/login']))
ok('Every protected write has CSRF',all(any(a.get('$ref')=='#/components/parameters/Csrf' for a in x['parameters']) for p,m,x in ops if m not in ['get','head'] and x['security']))
ok('Every entity FK target exists and is unique',True)
for n,m in c['models'].items():
 fields={x['name']:x for x in m['fields']}
 for rel in m['relations']:
  target=c['models'][rel['target']];tf={x['name']:x for x in target['fields']}
  keys=[['id']]+target['uniques']+[[x['name']] for x in target['fields'] if x.get('unique')]
  if rel['refs'] not in keys:raise AssertionError((n,rel,'target not unique'))
  for a,z in zip(rel['fields'],rel['refs']):assert fields[a]['type']==tf[z]['type'] and fields[a]['native']==tf[z]['native'],(n,a,z)
ok('All modeled FK column type/native pairs align',True)
text=(R/'prisma/schema.prisma').read_text()
ok('Prisma declares 33 models',len(re.findall(r'^model ',text,re.M))==len(c['models'])==33)
ok('All FK actions RESTRICT',len(re.findall('onDelete: Restrict, onUpdate: Restrict',text))==sum(len(x['relations']) for x in c['models'].values()))
ok('Gates omit G7',c['enums']['GateId']==['G1','G2','G3','G4','G5','G6'])
ok('Video unique is case-scoped', ['caseId','externalItemId'] in c['models']['ReportedItem']['uniques'] and ['externalItemId'] not in c['models']['ReportedItem']['uniques'])
ok('No writable candidate readiness field', all('READY_FOR_SIGNER' not in json.dumps(b['$defs'][n]) for n in ['CreateCandidate','ReviseCandidate']))
uid='11111111-1111-4111-8111-111111111111';uid2='22222222-2222-4222-8222-222222222222';sha='a'*64
fx=[]
def fixture(name,schema,data,valid):
 errors=validate(schema,data);ok(name,(not errors)==valid,'; '.join(e.message[:160] for e in errors[:2]) if ((not errors)!=valid) else '')
 fx.append({'name':name,'schema':schema,'expectedValid':valid,'payload':data})
fixture('Agency can begin with displayName','CreateAgency',{'displayName':'TEST Agency A'},True)
fixture('Agency does not require fabricated legalName','CreateAgency',{'displayName':'TEST A','legalName':None},True)
fixture('Agency rejects unknown ownership flag','CreateAgency',{'displayName':'TEST A','ownsAllWorks':True},False)
fixture('Agency empty name rejected','CreateAgency',{'displayName':''},False)
fixture('Empty PATCH rejected','PatchAgency',{},False)
fixture('Explicit null clears nullable field','PatchAgency',{'legalName':None},True)
fixture('Route needs legal subject association','CreateRoute',{'agencyId':uid,'ownerId':uid2},False)
fixture('Route create is not qualification','CreateRoute',{'agencyId':uid,'ownerSubjectId':uid2},True)
fixture('Unknown platform rejected','CreateRoute',{'agencyId':uid,'ownerSubjectId':uid2,'platform':'TWITTER'},False)
fixture('Signer agency cannot be PATCHed','PatchSigner',{'agencyId':uid2},False)
fixture('Case intake can omit route','CreateCase',{'agencyId':uid,'intakeLabel':'TEST intake'},True)
fixture('Case cannot set readiness by PATCH','PatchCase',{'readinessStatus':'READY_FOR_SIGNER'},False)
fixture('Mapping duration string accepted','CreateUseMapping',{'caseWorkId':uid,'reportedItemId':uid2,'occurrence':1,'sourceStartMs':'0','sourceEndMs':'108000000'},True)
fixture('Mapping numeric milliseconds rejected','CreateUseMapping',{'caseWorkId':uid,'reportedItemId':uid2,'occurrence':1,'sourceStartMs':0},False)
fixture('Mapping negative milliseconds rejected','CreateUseMapping',{'caseWorkId':uid,'reportedItemId':uid2,'occurrence':1,'sourceStartMs':'-1'},False)
fixture('Mapping missing duration preserved','CreateUseMapping',{'caseWorkId':uid,'reportedItemId':uid2,'occurrence':1,'sourceStartMs':None},True)
fixture('Source without URL can be operator input','CreateSource',{'title':'TEST operator statement','sourceRole':'OPERATOR_INPUT','scopeText':'Synthetic scope only'},True)
fixture('Source URL is not mandatory proof','CreateSource',{'title':'TEST navigation','sourceRole':'CANONICAL_RECORD','scopeText':'Synthetic','canonicalUrl':'javascript:alert(1)'},False)
fp={'scopeKind':'CASE','provenance':'MISSING','scopeText':'TEST case','changeReason':'Initial intake','factType':'PERMISSION','value':{'finding':'UNKNOWN','assertion':'','reviewScope':'Not reviewed'},'sources':[]}
fixture('Missing permission can be stored honestly','CreateFact',fp,True)
fixture('Unsupported fact type rejected','CreateFact',{**fp,'factType':'SCANNER_PROVED_INFRINGEMENT'},False)
fixture('Wrong typed fact payload rejected','CreateFact',{**fp,'value':{'verified':True}},False)
prompt={'taskType':'INITIAL','generationMode':'PREPARATION','expectedContextRevision':1,'expectedDependencyDigest':sha,'priorBindingIds':[]}
fixture('Preparation prompt structurally valid','GeneratePrompt',prompt,True)
fixture('Client cannot auto-approve prompt','GeneratePrompt',{**prompt,'readyForSigner':True},False)
cand={'promptSnapshotId':uid,'subject':'TEST draft','envelope':{'from':'notice@example.test','to':'review@example.test'},'bodyText':'Synthetic unsigned candidate only','preparedDocuments':[]}
fixture('Draft import is not legal readiness','CreateCandidate',cand,True)
fixture('Client-supplied candidate hash rejected','CreateCandidate',{**cand,'artifactSha256':sha},False)
fixture('Client-supplied signedAt rejected','CreateCandidate',{**cand,'signedAt':'2026-09-23T00:00:00Z'},False)
fixture('Client-supplied validation result rejected','ValidateCandidate',{'expectedArtifactSha256':sha,'expectedDependencyDigest':sha,'result':'TECHNICAL_PASS'},False)
assessment={'gate':'G7','result':'PASS','expectedArtifactSha256':sha,'expectedDependencyDigest':sha,'rulesetVersion':'TEST','scopeState':'RECORDED_NOT_ADOPTED','performerKind':'HUMAN','performerLabel':'TEST reviewer','provenance':'OPERATOR_REPORTED','rationale':'Synthetic','scopeText':'Synthetic','sources':[{'caseSourceId':uid,'supportedConclusion':'Synthetic'}]}
fixture('G7 assessment cannot be submitted','CaptureAssessment',assessment,False)
fixture('Recorded G1 input is only a report','CaptureAssessment',{**assessment,'gate':'G1'},True)
fixture('Assessment needs a source reference','CaptureAssessment',{**assessment,'gate':'G1','sources':[]},False)
fixture('Export does not accept send option','ExportUnsigned',{'expectedArtifactSha256':sha,'expectedDependencyDigest':sha,'validationRunId':uid,'format':'PLAIN_TEXT','send':True},False)
(R/'fixtures/request-validation-cases.json').write_text(json.dumps(fx,ensure_ascii=False,indent=2))
failed=[x for x in results if not x['passed']]
report={'scope':'OFFLINE_STRUCTURAL_SPEC_CHECKS_ONLY','checkCount':len(results),'passed':len(results)-len(failed),'failed':len(failed),'results':results,'notExecuted':['Prisma CLI format/validate','Prisma Client generation','MySQL migration/constraints/concurrency tests','Zod runtime validation/typecheck','HTTP/NestJS services','Browser E2E','Windows two-PC setup','Production/security/load/backup-restore testing']}
(R/'verification/structural-checks.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
print(json.dumps({'checks':len(results),'passed':report['passed'],'failed':len(failed),'failures':failed},ensure_ascii=False,indent=2))
sys.exit(bool(failed))
