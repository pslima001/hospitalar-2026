import csv, json, re, sys

def parse_row(empresa_stand):
    s = empresa_stand.strip()
    m = re.match(r'^(.+),\s*([A-Z])-([A-Za-z0-9]+)\s*$', s)
    if m:
        return m.group(1).strip(), m.group(2).upper(), m.group(3).lower()
    # Fallback: separar pela última vírgula
    if ',' in s:
        nome, tail = s.rsplit(',', 1)
        tail = tail.strip()
        m2 = re.match(r'^([A-Z])-?([A-Za-z0-9]+)$', tail, re.I)
        if m2:
            return nome.strip(), m2.group(1).upper(), m2.group(2).lower()
        # Caso "X-NN | Y-NN" → pega o primeiro stand
        m3 = re.search(r'([A-Z])-([A-Za-z0-9]+)', tail, re.I)
        if m3:
            return nome.strip(), m3.group(1).upper(), m3.group(2).lower()
        # Caso "SEM STAND" ou similar → mantém nome limpo
        return nome.strip(), '', ''
    return s, '', ''

rows = []
with open('base.csv', encoding='utf-8') as f:
    reader = csv.reader(f)
    header = next(reader)
    for i, row in enumerate(reader, start=2):
        if not row or not row[0].strip():
            continue
        nome, rua, stand = parse_row(row[0])
        status_raw = (row[1] if len(row) > 1 else '').strip()
        # Normaliza status
        sm = status_raw.lower()
        if sm.startswith('sim'): status = 'sim'
        elif sm.startswith('n'): status = 'nao'
        elif sm.startswith('prov'): status = 'provavel'
        elif sm.startswith('int'): status = 'intern'
        else: status = ''
        rows.append({
            'id': i - 1,
            'empresa': nome,
            'rua': rua,
            'stand': stand,
            'status': status,
            'prospects': [
                {'nome': (row[2] if len(row) > 2 else '').strip(),
                 'linkedin': (row[3] if len(row) > 3 else '').strip()},
                {'nome': (row[4] if len(row) > 4 else '').strip(),
                 'linkedin': (row[5] if len(row) > 5 else '').strip()},
            ]
        })

# Limpa prospects vazios
for r in rows:
    r['prospects'] = [p for p in r['prospects'] if p['nome'] or (p['linkedin'] and 'linkedin.com' in p['linkedin'].lower())]
    for p in r['prospects']:
        if p['linkedin'] and 'linkedin.com' not in p['linkedin'].lower():
            p['linkedin'] = ''

# Estatísticas
stats = {
    'total': len(rows),
    'sim': sum(1 for r in rows if r['status'] == 'sim'),
    'nao': sum(1 for r in rows if r['status'] == 'nao'),
    'provavel': sum(1 for r in rows if r['status'] == 'provavel'),
    'intern': sum(1 for r in rows if r['status'] == 'intern'),
    'sem_status': sum(1 for r in rows if r['status'] == ''),
    'sem_rua': sum(1 for r in rows if not r['rua']),
}
print(json.dumps(stats, indent=2, ensure_ascii=False))

with open('data.json', 'w', encoding='utf-8') as f:
    json.dump(rows, f, ensure_ascii=False, indent=1)
print(f"Wrote data.json with {len(rows)} rows")

# Mostra amostra dos sem rua para auditoria
sem_rua = [r for r in rows if not r['rua']]
if sem_rua:
    print("\nSEM RUA detectada:")
    for r in sem_rua[:10]:
        print(f"  - {r['empresa']!r}")
