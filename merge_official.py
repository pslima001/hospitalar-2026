import csv, json, re, unicodedata

def norm(s):
    if not s: return ''
    s = unicodedata.normalize('NFD', s).encode('ascii','ignore').decode('ascii').lower()
    s = re.sub(r'[^a-z0-9]', '', s)
    return s

def parse_booth(booth):
    """Extrai rua e stand do formato X-NN ou similar."""
    if not booth: return '', ''
    booth = booth.strip()
    # Tenta padrão LETRA-NÚMERO
    m = re.match(r'^([A-Z])-([A-Za-z0-9]+)$', booth, re.I)
    if m:
        return m.group(1).upper(), m.group(2).lower()
    # Múltiplos stands "X-NN | Y-MM" -> pega primeiro
    m = re.search(r'([A-Z])-([A-Za-z0-9]+)', booth, re.I)
    if m:
        return m.group(1).upper(), m.group(2).lower()
    return '', booth.lower()

# 1) Carrega API oficial (1100)
raw = json.load(open('all-exhibitors-raw.json', encoding='utf-8'))
print(f'API exhibitors: {len(raw)}')

# 2) Carrega planilha do usuário (base.csv) para mapear status + prospects
user_data = {}
try:
    with open('base.csv', encoding='utf-8') as f:
        reader = csv.reader(f)
        next(reader)
        for row in reader:
            if not row or not row[0].strip(): continue
            empresa_stand = row[0].strip()
            # Extrai nome (antes da vírgula com stand)
            m = re.match(r'^(.+?),\s*[A-Z]-', empresa_stand)
            nome = m.group(1).strip() if m else empresa_stand.split(',')[0].strip()
            status_raw = (row[1] if len(row) > 1 else '').strip().lower()
            if status_raw.startswith('sim'): status = 'sim'
            elif status_raw.startswith('n'): status = 'nao'
            elif status_raw.startswith('prov'): status = 'provavel'
            elif status_raw.startswith('int'): status = 'intern'
            else: status = ''
            prospects = [
                {'nome': (row[2] if len(row) > 2 else '').strip(),
                 'linkedin': (row[3] if len(row) > 3 else '').strip()},
                {'nome': (row[4] if len(row) > 4 else '').strip(),
                 'linkedin': (row[5] if len(row) > 5 else '').strip()},
            ]
            prospects = [p for p in prospects if p['nome'] or (p['linkedin'] and 'linkedin.com' in p['linkedin'].lower())]
            for p in prospects:
                if p['linkedin'] and 'linkedin.com' not in p['linkedin'].lower():
                    p['linkedin'] = ''
            user_data[norm(nome)] = {
                'status': status,
                'prospects': prospects,
                'nome_orig': nome,
            }
    print(f'User planilha: {len(user_data)} empresas')
except FileNotFoundError:
    print('base.csv não encontrado - sem dados de usuário')

# 3) Merge: para cada exhibitor da API, aplica dados do user se match
merged = []
matched = 0
for i, ex in enumerate(raw):
    nome = ex['name']
    type_ = ex.get('type', '')  # Premium/Target/Standard/Access 2026
    booth = (ex.get('withEvent') or {}).get('booth', '') or ''
    rua, stand = parse_booth(booth)
    n = norm(nome)
    user_entry = user_data.get(n)
    if user_entry:
        status = user_entry['status']
        prospects = user_entry['prospects']
        matched += 1
    else:
        status = ''
        prospects = []
    merged.append({
        'id': i + 1,
        'empresa': nome,
        'rua': rua,
        'stand': stand,
        'status': status,
        'prospects': prospects,
        'type': type_,  # categoria oficial Hospitalar (Premium/Target/Standard/Access)
    })

print(f'Matched: {matched}/{len(user_data)} planilha encontradas na API')

# 4) Empresas do user que NÃO foram matched (nomes divergentes ou inexistentes na API)
api_names = {norm(ex['name']) for ex in raw}
unmatched = []
next_id = len(merged) + 1
for un, ud in user_data.items():
    if un in api_names: continue
    unmatched.append({
        'id': next_id,
        'empresa': ud['nome_orig'],
        'rua': '', 'stand': '',
        'status': ud['status'],
        'prospects': ud['prospects'],
        'type': '',
        'orphan_from_user': True,
    })
    next_id += 1

print(f'Unmatched do user (mantidos como orfãos): {len(unmatched)}')

merged.extend(unmatched)

# Stats finais
stats = {
    'total': len(merged),
    'sim': sum(1 for e in merged if e['status'] == 'sim'),
    'nao': sum(1 for e in merged if e['status'] == 'nao'),
    'provavel': sum(1 for e in merged if e['status'] == 'provavel'),
    'intern': sum(1 for e in merged if e['status'] == 'intern'),
    'sem_status': sum(1 for e in merged if e['status'] == ''),
    'sem_rua': sum(1 for e in merged if not e['rua']),
    'by_type': {},
}
for e in merged:
    t = e.get('type', '') or 'sem_tipo'
    stats['by_type'][t] = stats['by_type'].get(t, 0) + 1
print(json.dumps(stats, indent=2, ensure_ascii=False))

with open('data.json', 'w', encoding='utf-8') as f:
    json.dump(merged, f, ensure_ascii=False, indent=1)
print(f'Wrote data.json with {len(merged)} empresas')
