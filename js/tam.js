// ══════════════════════════════════════════════════════════════
//  TAM FASHION — invoice parser  v7
//  · Triple engine cross-check
//  · Fixed: invoice number (ZY-) detection anywhere in row
//  · Fixed: nome column always visible with proper width
//  · Persistent motor selector — always shown on divergence,
//    click any motor to switch, active motor stays highlighted
//  · v7: REF_RE alargado — cobre 1296/1296 padrões + novas refs automáticas
//        KNOWN_REFS whitelist como fallback extra
//        tamFindRefInRow() detecta ref em qualquer posição da linha
//  · v7 bug fixes (Motor C):
//        [1] Engine C salta linhas com HS code → elimina triplos falsos
//        [2] tamExtractTypeAndName: strip HS codes e números ≥4 dígitos antes de processar
//        [3] tamCleanName: strip HS codes do nome; /44/g mantido (convenção TAM)
// ══════════════════════════════════════════════════════════════
(function () {

  /* ── drag & drop ─────────────────────────────────────────── */
  var upLabel = document.getElementById('tam-upload-label');
  if (!upLabel) return;
  upLabel.addEventListener('dragover',  function(e){ e.preventDefault(); upLabel.classList.add('drag-over'); });
  upLabel.addEventListener('dragleave', function(){ upLabel.classList.remove('drag-over'); });
  upLabel.addEventListener('drop', function(e){
    e.preventDefault(); upLabel.classList.remove('drag-over');
    var f = e.dataTransfer.files[0];
    if (f && f.type === 'application/pdf') tamHandleFile(f);
  });
  document.getElementById('tam-file-input').addEventListener('change', function(e){
    if (e.target.files[0]) tamHandleFile(e.target.files[0]);
  });

  var tamCurrentResult = null;
  var tamEngineResults = {};      // { A, B, C } — kept across renders
  var tamActiveEngine  = null;    // 'A'|'B'|'C'|null (null = auto)

  /* ════════════════════════════════════════════════════════════
     MAIN HANDLER
  ════════════════════════════════════════════════════════════ */
  async function tamHandleFile(file) {
    ['tam-results-wrap','tam-invoice-meta','tam-validation-banner'].forEach(function(id){
      var el = document.getElementById(id);
      el.className = ''; el.innerHTML = '';
    });
    document.getElementById('tam-file-name').textContent = file.name;
    document.getElementById('tam-status-msg').textContent = 'a processar…';
    document.getElementById('tam-export-btn').classList.remove('show');
    tamCurrentResult = null; tamEngineResults = {}; tamActiveEngine = null;

    try {
      var buf = await file.arrayBuffer();
      var pdf = await pdfjsLib.getDocument({ data: buf }).promise;
      var allRows = [];
      for (var p = 1; p <= pdf.numPages; p++) {
        var page = await pdf.getPage(p);
        allRows.push.apply(allRows, tamGroupByRows((await page.getTextContent()).items));
      }

      var resA = tamEngineA(allRows);
      var resB = tamEngineB(allRows);
      var resC = tamEngineC(allRows);
      tamEngineResults = { A:resA, B:resB, C:resC };

      var result = tamCrossValidate(resA, resB, resC, null);
      if (!result.grouped.length) {
        document.getElementById('tam-status-msg').textContent = 'nenhum artigo encontrado.';
        return;
      }

      document.getElementById('tam-upload-label').classList.add('loaded');
      document.getElementById('tab-tam').classList.add('tam-loaded');
      document.getElementById('admin-app').classList.add('tam-loaded');

      tamEnsureStyles();
      tamApplyResult(result);
    } catch(err) {
      console.error(err);
      document.getElementById('tam-status-msg').textContent = 'erro: ' + err.message;
    }
  }

  function tamApplyResult(result) {
    tamCurrentResult = result;
    tamRenderMeta(result);
    tamRenderValidation(result);
    tamRenderTable(result);
    document.getElementById('tam-export-btn').classList.add('show');
  }

  /* ════════════════════════════════════════════════════════════
     SHARED UTILITIES
  ════════════════════════════════════════════════════════════ */
  // Comprehensive reference regex — covers all observed patterns:
  //   · Prefix 1-5 letters, mixed-case OK (FaYa, Ebb)
  //   · Optional sub-prefix segments (-C, -PO, -HS, -TO …)
  //   · Separators: hyphen, underscore, dot, or ONE space before a short suffix
  //   · ZY- excluded (those are invoice numbers, not product refs)
  var REF_RE = /^(?!ZY-)[A-Za-z]{1,5}(?:-[A-Za-z]{1,3})*[-_.]([A-Za-z0-9]+)((?:[-_.]| (?=[A-Za-z0-9]{1,4}$))[A-Za-z0-9]+){0,5}$/;
  var HS_RE  = /\b(\d{8})\b/;  // any 8-digit customs code (covers chapters 42, 60-69, etc.)
  // ZY invoice number — can appear anywhere in a row
  var ZY_RE  = /\b(ZY-[2][\d]{7,})\b/;  // invoice numbers start with ZY-2x (year prefix 22-26+)

  // ── Known reference list (1296 entries from PATRON_DE_REFERENCIAS) ─────────────
  var KNOWN_REFS_ARR = [
    'HFA-62502025',
    'JUS-25562',
    'JY-20765PTY',
    'MOR-20125',
    'NK-2412046',
    'QJG-2504049',
    'SJA-2501019',
    'BK-148-035',
    'BK-148-037',
    'BK-148-124-2',
    'BK-148-205',
    'DA-251-0282',
    'DO-6353ASAT',
    'NO-801-0278',
    'SYF-251-0418',
    'AY-P-D424-LZ',
    'BK-108-728',
    'BK-133-154',
    'BK-133-156',
    'BK-133-163',
    'BK-144-171',
    'BK-147-085',
    'BK-147-102',
    'BK-148-038',
    'BK-148-047',
    'BK-148-049',
    'BK-148-055',
    'BK-148-057',
    'BK-150-038',
    'BK-150-039',
    'BK-156-017',
    'BK-165-016',
    'BK-165-017',
    'BK-165-020',
    'DA-1911019-3',
    'DA-2211026-A',
    'DA-2302028',
    'DCH-TO2412072',
    'DF-5366-A',
    'DO-6522-1',
    'DO-6683',
    'EB-2302032',
    'EB-801-0197',
    'JIA-TO2402015PTY',
    'JUS-24600',
    'JUS-24757PTY',
    'KY-2211084',
    'LA-2302036',
    'LF-2180',
    'LF-27880',
    'LP-2311010',
    'LP-2311012',
    'LP-2311040',
    'LTF-62509007',
    'MAN-2409030',
    'NK-201-0118-1',
    'NK-2402018',
    'NO-2002076-A',
    'NO-2402002',
    'NO-2402003',
    'QJG-TO2310127',
    'SN-301-0235',
    'SYF-2211088',
    'SYF-2309038',
    'SYF-351-0121',
    'UNF-5021',
    'UNF-5188',
    'YAM-2403022',
    'YU-1911057-2A',
    'YU-201-0334',
    'DF-65106',
    'KY-201-0317',
    'SYF-2311035',
    'SYF-351-0113',
    'SY-PO-401-0167',
    'XIE-62404029',
    'YU-401-0151',
    'BK-108-698',
    'BK-108-725',
    'BK-133-164',
    'BK-133-165',
    'COK-2311032',
    'DF-3910',
    'BK-148-050',
    'BK-123-133',
    'BK-148-051',
    'LT-301-0221',
    'NO-201-0408',
    'AFM-90566',
    'BFA-5561',
    'BFA-9590',
    'BFA-9722',
    'BFA-9945',
    'BIQ-2403010',
    'BK-108-673',
    'BK-108-704',
    'BK-108-724',
    'BK-133-171',
    'BK-134-179',
    'BK-144-185',
    'BK-144-186',
    'BK-144-189',
    'BK-144-190',
    'BK-144-191',
    'BK-144-203',
    'BK-148-005-1',
    'BK-148-013-1',
    'BK-148-028',
    'BK-150-037',
    'BK-156-018',
    'BK-163-010',
    'BUE-2211015',
    'BUE-2311005',
    'COK-2211035',
    'DA-2211023',
    'DA-2309061',
    'DA-2309090',
    'DA-2311031',
    'DA-351-0110',
    'DCH-2211013',
    'EB-2302033',
    'EB-2311009',
    'EBB-2402027',
    'EBB-2402032',
    'EBB-TO2402035',
    'EMK-24787PTY',
    'EMK-BW24003',
    'HFA-62211097',
    'HFA-62508010',
    'HFA-62508011',
    'HFA-62508012',
    'HFA-62508013',
    'HFA-62509003',
    'JG-2302039',
    'JIA-2402001',
    'JIA-C-301-0227',
    'KY-2002064-2',
    'KY-2209028',
    'KY-2311007',
    'KY-2311014',
    'KY-2311016',
    'KY-2412048',
    'KY-251-0292',
    'KY-751-0081',
    'KY-C-201-0322',
    'KY-C-251-0291',
    'LA-751-0037-1',
    'LA-851-0018-1',
    'LF-2179',
    'LP-2309025',
    'LP-2311006',
    'LP-2311013',
    'LT-2309055',
    'LT-301-0288',
    'NK-2209098',
    'NK-2209123-A',
    'NK-2210011',
    'NO-2402040',
    'NO-TO2402005',
    'QJG-2311015',
    'QJG-251-0289',
    'QJG-251-0297',
    'SJA-2302018',
    'SYF-2301004-1',
    'SYF-251-0199',
    'SYF-251-0298',
    'UNF-3305',
    'UNF-5013',
    'UNF-5043',
    'UNF-5213',
    'UNF-5220',
    'VM-231305-1',
    'VM-TO250201',
    'WAL-251-0281',
    'WAL-251-0290',
    'YKK-1811038-2',
    'YKK-2011001-2',
    'YS-2402024',
    'YS-301-0291',
    'YS-301-0294',
    'YU-251-0208',
    'AY-HS-D-D6175-B',
    'AY-HS-P-D292',
    'AY-HS-P-D6439-B',
    'BAT-C-301-0243',
    'BK-108-566',
    'BK-108-581',
    'BK-108-690',
    'BK-108-716',
    'BK-108-719',
    'BK-123-162',
    'BK-133-129',
    'BK-133-176',
    'BK-134-147',
    'BK-144-150',
    'BK-148-029',
    'BK-148-031',
    'BK-148-033',
    'BK-148-048',
    'BK-153-002',
    'BK-165-019',
    'COK-251-0093-4',
    'DA-2309019',
    'DCH-2302013',
    'DO-6651SAT',
    'DO-6654PLI',
    'DO-6682',
    'EB-201-0390',
    'EMK-BW063',
    'HFA-62304016-1',
    'HFA-659163-1',
    'HFA-659168-2',
    'HFA-659337-1',
    'HFA-72212012',
    'HFA-72301002',
    'HFA-72304014',
    'HFA-72404010',
    'JIA-2402013PTY',
    'JUS-23513',
    'JY-20651',
    'JY-20662-1PTY',
    'JY-20730',
    'JY-20763PTY',
    'KY-2112045-1',
    'KY-2302016',
    'LA-2303084',
    'LA-301-0213',
    'LA-751-0056-1',
    'LF-2022283',
    'LF-22572-A1',
    'LP-801-0155',
    'LT-151-0257',
    'NK-1702038-3A',
    'NO-801-0151',
    'NW-2211049',
    'NX-2203012-1',
    'NX-2211052-1',
    'PMG-5553PTY',
    'QF-2409001',
    'SN-151-0200',
    'SN-751-0051',
    'SN-801-0126',
    'SP-2302023',
    'SXS-301-0293',
    'TIP-22508MUS',
    'UNF-2064',
    'UNF-3172',
    'UNF-3222',
    'UNF-5011',
    'UNF-5019',
    'VM-243301',
    'VM-TO240325',
    'VM-TO250301',
    'YS-301-0298',
    'YU-236-0235-1',
    'EMK-24055',
    'HFA-72212014',
    'HFA-62211001',
    'HFA-62211002',
    'WAL-M0920214',
    'WAL-M0920215',
    'CJ-M0120228',
    'LT-1902026-1',
    'HM-889A',
    'UNI-C159',
    'DCH-2205005',
    'WAL-PO20080052-1',
    'WI-2205015',
    'APP-M0820220',
    'APP-M0820221',
    'APP-M0820222',
    'BUE-2205108',
    'NK-1702038-1B',
    'SYF-2205031',
    'WAL-M0120222',
    'YKK-2205030',
    'DA-2205020',
    'HM-1556-A',
    'HM-2218',
    'JY-20533-T',
    'NK-2205002',
    'NT-2202024',
    'SJI-2107036',
    'YKK-2106021',
    'YKK-2205029',
    'UNI-C356',
    'YG-ZB156-1',
    'YG-ZB156-1Z1',
    'LT-2206043-C',
    'DO-6353SAT',
    'HM-203Z1',
    'COF-2008025',
    'DO-6302',
    'JY-20262',
    'JY-20282',
    'JY-20302',
    'KES-15754',
    'ND-2107033',
    'ND-2108002',
    'NT-2107012',
    'QI-0916525',
    'SKT-2108022',
    'SN-2108038',
    'SS-21825',
    'SYN-2008052-1',
    'SYN-2108047',
    'TD-2108006',
    'VM-230306SET1',
    'WAL-1906018',
    'WAL-20080052-1',
    'WAL-2108052',
    'WB-2007003',
    'WI-2008048-A',
    'MIK-6383A',
    'MIK-9336',
    'SP-2202023',
    'WI-201-0059Z1',
    'KY-201-0132',
    'WS-C-301-0183',
    'HF-301-0187',
    'APP-C-101-0083',
    'KY-201-0088',
    'SXS-151-0114',
    'SN-C-301-0144',
    'SJI-301-0107-1',
    'WAL-201-0157',
    'SP-1907021A',
    'WS-C-751-0045',
    'HM-6983',
    'LT-2108018',
    'KY-201-0127-1',
    'KY-201-0140-1',
    'LT-801-0107',
    'WI-C-101-0084',
    'SP-301-0109-1',
    'SKT-801-0068-1',
    'LT-301-0190',
    'LP-201-0230',
    'SYN-C-241-0240',
    'BK-108-379',
    'LT-2008005',
    'DO-6239',
    'WIN-0915222B',
    'DO-6252',
    'LT-0616471-1',
    'AIM-PO2206037',
    'HM-792Z1',
    'DO-6353Z1SAT',
    'HF-1909005',
    'HF-751-0042',
    'JY-10930A',
    'KY-201-0219',
    'SJI-151-0069-1',
    'SN-C-301-0209',
    'WAL-1908009-1',
    'HM-1971',
    'LA-2206085',
    'NK-701-0024',
    'SN-C-801-0118',
    'TD-2105003',
    'HM-19721',
    'KY-2208046Z1',
    'SP-1907021A-Z1',
    'SP-1907021Z1',
    'WI-2206014',
    'HM-1927',
    'HM-1984',
    'TD-2107001',
    'WAL-1908009',
    'BOX-C-301-0204',
    'SYN-2008041',
    'JY-20352',
    'HF-2208012',
    'SN-2208110-C',
    'APP-2208040',
    'LF-22572',
    'HM-2220',
    'JY-20392SAT',
    'DA-2205022',
    'QI-0915258',
    'LP-151-0140',
    'KY-201-0240',
    'KY-201-0249',
    'SJA-201-0069-2',
    'WAL-1906039-1',
    'TD-2105004',
    'NT-301-0103-1',
    'SJA-101-0069',
    'SJA-201-0232',
    'SN-801-0105',
    'SP-201-0225',
    'WAL-201-0149',
    'WAL-201-0229',
    'YU-201-0227',
    'AIM-2206074',
    'AIM-M0920230',
    'BK-123-037',
    'BK-139-013',
    'DA-2107001',
    'DF-5217',
    'HL-2208001',
    'HRT-M0220232',
    'JY-20387',
    'KY-2206061',
    'LC-22298',
    'NT-2107019',
    'SJA-101-0078',
    'SN-2108038Z1',
    'SN-301-0182',
    'SN-751-0040',
    'SP-1907021-1',
    'SXS-C-301-0184',
    'WAL-1908009-5242',
    'WIN-0616455A',
    'WIN-2008044-1',
    'WS-201-0234',
    'JY-20538MES',
    'LP-2208022Z1',
    'TD-2008064-1',
    'WAL-1908009-5238Z1',
    'JX-1808088',
    'JY-20386',
    'LP-201-0228',
    'LP-2208049',
    'NT-2107019NO.5192',
    'QI-2106031',
    'WIN-1908010A',
    'KI-62205102',
    'BK-108-454',
    'BK-123-039',
    'DO-3748C',
    'LA-0915222A-Z1',
    'LA-801-0046-1',
    'SN-2206034',
    'SP-2208019',
    'SP-2208024',
    'SXS-2208016',
    'WAL-1909005NO.5014',
    'WAL-2008056-1',
    'BK-123-040',
    'BOX-C-301-0198',
    'SYN-101-0047',
    'BOX-C-301-0197',
    'JX-301-0169',
    'LT-301-0141',
    'WS-C-301-0199',
    'LT-2208023',
    'BOX-C-301-0202',
    'GUA-2303079',
    'HFA-62205013',
    'HM-1543',
    'NK-C-301-0210',
    'YU-2206075C',
    'HFA-658325',
    'HFA-658631',
    'JY-20508',
    'KI-62205109',
    'DO-6548',
    'QI-0916525-2',
    'JY-20399MES',
    'WIN-1908010',
    'WIN-2007002NO.5216',
    'LP-235-0234',
    'LP-801-0113',
    'NK-301-0174',
    'NSU-C-203-0201',
    'NT-301-0094',
    'NT-301-0099-1',
    'SYF-351-0050',
    'WI-201-0207',
    'DA-2205032',
    'DCH-C-201-0294',
    'HM-809B',
    'KY-2205004-C',
    'LA-201-0290',
    'LA-C-201-0296',
    'LF-2021821SET1',
    'LP-C-221-0220',
    'SN-301-0220',
    'WAL-101-0059',
    'DA-2205034',
    'KY-201-0289',
    'AIM-201-0255',
    'BK-123-059',
    'DF-3019A',
    'KY-1908053',
    'LP-201-0225',
    'NK-217-0216',
    'NO-201-0288',
    'SJA-210-0209',
    'WAL-2106024-A',
    'WAL-201-0267',
    'BOX-2302025',
    'BYF-11106',
    'DA-2006038',
    'DCH-2205011',
    'HF-2208035',
    'JIA-2202015',
    'JY-20632',
    'JY-20638',
    'JY-20639',
    'KY-2208058',
    'SP-2302022',
    'EB-2210015',
    'BK-134-152',
    'BOX-2302028',
    'DO-6378SAT',
    'DO-6524',
    'DO-6528',
    'DO-6529',
    'DO-6541',
    'JIA-2302021',
    'JY-20676',
    'MIK-6382A',
    'MIK-67255',
    'PMG-2581',
    'BK-123-038',
    'DCH-C-246-0245',
    'HFA-62205041',
    'HFA-62205044',
    'HFA-62205046',
    'HFA-659052',
    'HFA-659238',
    'JY-20359SAT',
    'JY-20503',
    'JY-20533',
    'JY-20534SAT',
    'JY-20551',
    'JY-20555',
    'JY-20557',
    'JY-20560',
    'KY-201-0127-2',
    'KY-2208046',
    'KY-2210016',
    'LA-101-0076',
    'LA-2206064',
    'LP-801-0116',
    'LT-801-0070',
    'QI-2205101',
    'SP-801-0114',
    'VM-230360',
    'WAL-1908009-1Z1',
    'WI-2208039',
    'WS-301-0193',
    'BK-123-067',
    'BK-123-069',
    'BOX-2302024',
    'LA-301-0217',
    'LA-301-0237',
    'SN-301-0130',
    'WAL-PO-260-0259',
    'JY-20650',
    'BK-134-121',
    'BK-144-032',
    'BK-144-033',
    'DO-6351PLI',
    'DO-6375PLI',
    'HRT-2108008',
    'JY-201353-1',
    'JY-20233-1',
    'JY-20360',
    'JY-20379',
    'JY-20380',
    'JY-20385',
    'KES-16023SAT',
    'KES-16277SAT',
    'LA-2302037',
    'LF-2021822',
    'LF-26049Z1',
    'LF-27192SET1',
    'LT-2111044',
    'MDC-401-0130',
    'MIK-6463',
    'NK-2205046',
    'NM-20510',
    'NX-2205052',
    'SYF-251-0156',
    'VM-230307Z1',
    'WAL-101-0088',
    'WAL-2106024',
    'YU-2205014-C',
    'JB-301-0148',
    'SRB-2111034',
    'WI-2205108',
    'JIA-101-0086',
    'BK-147-024',
    'COK-251-0118',
    'DA-1906019-2',
    'DA-1911012-2',
    'DA-1911018-2',
    'DA-2111019',
    'DA-351-0045',
    'HFA-659170',
    'HFA-659171',
    'HFA-659174',
    'HFA-659176',
    'HFA-659233',
    'HFA-659340',
    'HFA-659341',
    'HFA-659393',
    'HM-1835',
    'HM-1844',
    'HM-1887',
    'HM-1890',
    'HM-1910',
    'HM-1912',
    'HS-2111066',
    'TD-2111006',
    'WAL-2011007-1',
    'BK-147-023',
    'BYF-6626',
    'COK-2111015',
    'COK-C-251-0138',
    'DUH-2011056-1',
    'HM-1813',
    'HM-1837',
    'TD-2011018-1',
    'WAL-2111018',
    'WAL-251-0077',
    'BK-134-097',
    'BK-147-004',
    'DA-1911017-2',
    'HFA-659339',
    'HM-1532A',
    'HM-1821',
    'HM-1897',
    'HM-1900',
    'VM-210349',
    'BAT-151-0177',
    'BAT-801-0141',
    'BK-144-020',
    'DCH-C-201-0300',
    'LA-C-801-0144',
    'NX-401-0017-2',
    'BK-108-500',
    'BK-123-027',
    'BK-144-071',
    'BK-144-073',
    'BK-150-014',
    'QJG-201-0272',
    'SN-151-0179',
    'SN-301-0131',
    'SXS-301-0225',
    'APP-201-0242',
    'BAT-801-0139',
    'BIA-809',
    'BK-108-559',
    'BK-115-082',
    'BK-123-035',
    'BK-123-055',
    'BK-144-083',
    'BK-154-002',
    'BUE-2211018',
    'DF-28057',
    'HFA-62307987',
    'HL-2211008 Z1',
    'HL-2211008',
    'HS-C-151-0160',
    'JY-20607MES',
    'KY-201-0096-2',
    'LA-751-0056',
    'LA-801-0110',
    'LP-101-0077',
    'NK-301-0163',
    'NK-301-0188',
    'NK-C-801-0122',
    'SKT-151-0090-1',
    'WS-701-0015',
    'WS-801-0100',
    'WS-C-801-0121',
    'YU-101-0078',
    'BK-147-026',
    'BAT-151-0180',
    'BK-123-045',
    'BK-123-063',
    'BK-123-065',
    'BK-133-116',
    'BK-147-021',
    'COK-251-0116',
    'EMK-23505',
    'HS-251-0162',
    'JIA-2302030',
    'KY-201-0248',
    'LC-22582',
    'NK-801-0105',
    'NT-801-0063-1',
    'SJA-801-0111',
    'SN-301-0218',
    'SN-301-0225',
    'SP-801-0099',
    'VM-22134',
    'BOX-C-701-0029',
    'QI-701-0022',
    'WAL-151-0037-1',
    'LC-23362',
    'AIM-251-0235',
    'BIA-3292',
    'BK-148-007',
    'BK-148-016',
    'KI-62306458',
    'KY-2306006',
    'KY-C-201-0337',
    'LA-301-0357',
    'LA-C-201-0345',
    'LP-211-0210',
    'NHF-151-0213',
    'NT-C-301-0173-1',
    'QJG-C-201-0297',
    'WI-C-151-0233',
    'YKK-251-0238',
    'YKK-351-0096',
    'FAYA-2307002C',
    'BK-156-014',
    'KY-2308034',
    'KY-PO2301010S',
    'LT-2108062-1',
    'NK-201-0353',
    'SJI-PO2206009-A',
    'AIM-2308048',
    'EMK-230136',
    'JY-20688',
    'JY-20699',
    'QJG-PO2304006',
    'SP-1907021-1B',
    'YU-2306002',
    'AIM-2308047',
    'DA-2306013',
    'KY-2308050',
    'QJG-TO2306047',
    'SJA-PO2304012',
    'LF-22572-A',
    'LP-PO2304051',
    'YIN-TO2306107',
    'QJG-PO2304010',
    'BK-123-079',
    'BK-123-110',
    'BK-123-111',
    'DF-5217-1',
    'HF-2208012-1',
    'HFA-62210488',
    'KY-2308032',
    'LA-PO-101-0034',
    'LP-2308031',
    'PMG-5225',
    'SXS-2308030',
    'UAP-1908009-1',
    'YU-2306001',
    'HFA-62307012',
    'KY-201-0112-2',
    'WI-PO2304025',
    'BK-157-016',
    'EMK-24179',
    'HF-PO2208012-1',
    'LP-201-0351',
    'LP-2308026',
    'JY-20708',
    'BK-144-120',
    'NK-201-0289',
    'NO-201-0276',
    'DA-2205021',
    'DO-6380Z1',
    'LP-2208048',
    'DA-2007014',
    'HF-22080010',
    'HF-2208008',
    'JY-20527',
    'KES-16864PLI',
    'KI-62205104',
    'LT-0616471-1-Z1',
    'LT-2206075',
    'SJA-201-0231',
    'SN-2206085',
    'WAL-2209008-C',
    'WS-801-0102',
    'BK-123-041',
    'JY-20532',
    'SN-151-0089-1',
    'SN-2206071',
    'JY-20269',
    'KY-201-0146',
    'NT-801-0063',
    'NT-C-801-0019',
    'QI-2108069',
    'RUI-2108067',
    'SJA-2209007-C',
    'SP-2208109-C',
    'SXS-151-0131',
    'VF-2108071',
    'YU-802-0005-1',
    'BOX-101-0096',
    'DO-6611',
    'LA-201-0354',
    'LA-PO2304019',
    'LT-301-0264',
    'SP-1907021-BZ1',
    'BK-148-008',
    'DF-5698-1Z1',
    'JUS-20137',
    'KY-201-0096-3',
    'KY-201-0145',
    'KY-2308040',
    'KY-2308053',
    'LA-220-0219-1',
    'LA-2308029',
    'LT-2107039',
    'LT-2303055',
    'QI-2108074',
    'QJG-2308027',
    'SJA-201-0141-2',
    'SJI-751-0069',
    'SXS-151-0116',
    'SXS-2308033',
    'YU-201-0225',
    'DA-2306018',
    'HF-2208036-A',
    'KES-17983',
    'LT-2308017',
    'SN-2303063',
    'SXS-2308041',
    'UAP-1908009-1Z1',
    'WIN-0915222-B',
    'AIM-2306008',
    'BK-148-013',
    'BK-155-066',
    'BK-155-070',
    'BK-155-073',
    'BK-155-075',
    'BOX-101-0097',
    'BOX-801-0176',
    'DA-PO2205020',
    'HFA-92309001Z1',
    'JUS-21406-2',
    'JY-20691',
    'JY-20733',
    'LA-301-0268',
    'LA-801-0088-1',
    'SJA-PO2304043',
    'SKT-151-0212',
    'WAL-2306020',
    'WIN-1908009-1Z1',
    'WI-PO-201-0326',
    'WS-301-0260',
    'YIS-151-0228',
    'YS-2308056',
    'SJI-PO-301-0262',
    'SXS-PO-101-0092',
    'UI-62306010',
    'YKK-PO-251-0223',
    'JY-20779',
    'JY-20663-APTY',
    'JY-20668-APTY',
    'JY-20762PTY',
    'BK-123-072',
    'BK-134-146',
    'LT-151-0181',
    'NK-251-0050',
    'NX-401-0172',
    'SJA-201-0069-1',
    'SN-301-0216',
    'SP-151-0058-1',
    'BK-144-124',
    'AFM-92611',
    'BIA-3163',
    'BK-133-132',
    'BK-147-038',
    'BK-150-004-1',
    'BK-150-008',
    'BK-150-013',
    'BK-157-007',
    'BK-157-010',
    'BK-157-011',
    'DA-2211036',
    'DCH-2302019',
    'DF-5366',
    'EMK-23775B',
    'JIA-2211010',
    'JY-20332PTY',
    'KY-2209049',
    'LA-151-0199',
    'LA-2303083',
    'LC-21618PLI',
    'LC-23828',
    'LF-2022077',
    'MIK-9802',
    'NK-301-0240',
    'PBT-2108008-2',
    'SN-301-0255',
    'TIP-21503',
    'WRI-251-0200',
    'BAT-801-0166',
    'BK-144-137',
    'BK-148-006',
    'BOX-C-301-0231',
    'BUE-2210002',
    'DA-2211038',
    'DO-6355PTY',
    'DO-6522',
    'DO-6545',
    'DO-6565',
    'DO-6575',
    'JY-20575',
    'KM-MZ-630',
    'LF-28120',
    'NK-301-0214',
    'BK-108-592',
    'SP-301-0159-1',
    'BK-108-601',
    'BK-119-253',
    'BK-123-068',
    'SN-151-0176',
    'SYF-2211021',
    'SYF-251-0204',
    'WAL-2211030',
    'WAL-2211032',
    'BAT-751-0054',
    'BK-144-138',
    'JIA-2209013',
    'LA-301-0239',
    'SYF-2211017',
    'WS-301-0219',
    'BAT-301-0138',
    'COK-2211019',
    'DA-351-0073',
    'SJA-201-0284',
    'BUE-2211034',
    'COK-251-0248',
    'HYG-2211057',
    'NT-2202024-1',
    'NX-2211052',
    'SYF-2211025',
    'SYF-2301003',
    'BAT-801-0135',
    'BUE-251-0244',
    'FaYa-251-0244',
    'LT-2108031',
    'QI-601-0031-1',
    'QI-601-0069',
    'SYF-251-0154',
    'YKK-2205025-1',
    'YU-2108026',
    'BK-108-555',
    'BK-156-003',
    'BYF-9730',
    'COK-351-0093',
    'DA-2106020',
    'DA-2205027',
    'DA-351-0051',
    'DCH-2306005',
    'HF-2007003',
    'HF-2008001A',
    'HM-1141A',
    'JY-10983Nr.0632',
    'JY-10983Nr.0642',
    'JY-20339',
    'KY-201-0127-3',
    'KY-C-201-0349',
    'LP-201-0358',
    'NK-801-0168',
    'NT-2108032',
    'QI-2108070',
    'QI-2208101',
    'QJG-C-251-0250',
    'SIH-YF002-29',
    'SP-2108063',
    'SYN-2008038',
    'TD-2008057-1',
    'TD-2108001',
    'TD-251-0179',
    'WAL-1908009No.5243',
    'WAL-2008050-1',
    'WAL-2107009',
    'WAL-2108045',
    'WI-201-0309',
    'WI-2106007',
    'WS-151-0008-2',
    'YU-2106005',
    'YU-2106010',
    'YU-2108007',
    'YU-C-226-0225',
    'BK-115-076',
    'BK-133-115',
    'DCH-2205005-1',
    'KI-62205105',
    'KY-201-0264',
    'KY-PO-201-0112-2',
    'LA-PO-101-0104',
    'LP-PO2301013',
    'LWI-201-0367',
    'NK-2406028',
    'NO-201-0275',
    'SJA-2302015',
    'SJA-2308046',
    'SJA-PO2304012-A',
    'SN-451-0042',
    'SP-101-0096-1',
    'SP-C-301-0337',
    'SYF-2406016',
    'SYF-PO2401005',
    'SYF-TO2406001',
    'WAL-2107005No.5215',
    'YKK-2306014-A',
    'YU-C-201-0293',
    'BK-108-593',
    'EB-201-0352',
    'QJG-2306004',
    'SYN-PO2008041',
    'BK-108-578',
    'BK-133-142',
    'BK-155-014',
    'DA-2210014',
    'DCH-2211005',
    'DCH-2302010',
    'KY-2211004',
    'LC-23848',
    'SJA-2302009',
    'SN-301-0226',
    'SYF-2211090',
    'SYF-2301002',
    'VM-231309',
    'WAL-201-0307',
    'WAL-2211029',
    'XX-401-0137',
    'NO-PO2401010',
    'SYN-101-0060-1',
    'GUY-0616471-2',
    'KY-2406040',
    'LP-2208022',
    'LT-2107010No.5139',
    'SYF-2406018',
    'FaYa-2306009',
    'LWI-2408013C',
    'AIM-2308048-A',
    'AIM-2404093',
    'COF-2008025No.5251',
    'HF-2208013',
    'JY-20271',
    'JY-20807',
    'KY-2406041',
    'KY-TO2306136-1',
    'LT-2308014',
    'SN-801-0110',
    'SP-1907021-2',
    'SP-2208014',
    'YS-2404088',
    'BFA-5495',
    'EB-2304062',
    'Ebb-PO2206009',
    'WAL-2406017',
    'WIN-2007002No.5073',
    'DF-3018',
    'DF-5739',
    'JX-1908070-2',
    'JY-20627MES',
    'KY-1702039-3S',
    'KY-2206082',
    'LA-2112042-1',
    'LA-2209117',
    'LA-PO2209117',
    'LC-22272Nr.0795',
    'QI-0915258-2',
    'SJI-2209003-C',
    'VM-230308Mus',
    'NO-2008039-1',
    'SYF-2211022',
    'BK-123-018',
    'HF-1808047',
    'PMG-3137',
    'SJA-151-0129',
    'NT-2206006',
    'BK-108-528',
    'JY-20523',
    'LP-151-0128',
    'LP-2109025',
    'LT-0616471NO.5221',
    'SJA-151-0075-1',
    'SJA-151-0088-1',
    'SJI-151-0142',
    'SKT-151-0090',
    'SP-2208024Z1',
    'QI-0615263-1',
    'SN-2206090',
    'SXS-2208037',
    'LP-2208009',
    'WIN-1708116A',
    'BOX-2208017',
    'DA-2205026',
    'HF-2205050',
    'HF-22080011',
    'HF-2208002',
    'HF-2208010',
    'JIA-2208015',
    'NA-2108021',
    'QI-2208020',
    'SXS-2208026',
    'BK-134-066-2',
    'KY-151-0137',
    'LA-751-0043',
    'LA-801-0069',
    'QI-701-0021',
    'QI-751-0036',
    'SJA-201-0142-1',
    'SJA-PO101-0069',
    'SN-101-0071',
    'SN-301-0189',
    'SXS-301-0186',
    'SYN-201-0168',
    'WAL-C-249-0248',
    'WS-301-0116',
    'YU-C-151-0150',
    'KY-PO-201-0096-1',
    'WAL-0916615-1',
    'LWI-2409086',
    'BK-123-103',
    'BK-123-129',
    'BK-141-032',
    'BK-141-034',
    'BK-141-035',
    'BK-142-021',
    'BK-142-025',
    'BK-150-017',
    'BK-150-022',
    'BK-155-018',
    'BK-155-068',
    'BK-157-014',
    'CON-4367-1',
    'DA-2007014-1',
    'DLR-TO2306107',
    'DO-6386PLI',
    'DO-6606',
    'HFA-62308045',
    'HFA-62308047',
    'JUS-24201',
    'KY-201-0140',
    'LF-2022178_N',
    'LT-0616471-1-0',
    'MIK-6512-1',
    'MIK-9234',
    'MIK-9816',
    'PMG-3822',
    'QJG-2308024',
    'SN-301-0206',
    'SYN-2008041-A',
    'VM-230302-1',
    'WIN-1708116-A',
    'YS-2308013',
    'BAT-151-0216',
    'BFA-9785',
    'BK-108-642',
    'BK-123-112',
    'BK-123-113',
    'BK-123-114',
    'BK-123-117',
    'BK-123-123',
    'BK-155-022',
    'BK-155-027',
    'BK-155-052',
    'BK-155-060-1',
    'BK-155-061',
    'BK-155-064',
    'BK-157-020',
    'CON-2307-1',
    'CON-4367-7',
    'CON-TR3331-1',
    'CON-XH1684-1',
    'EMK-24170',
    'FB-62306011',
    'HAI-62308040',
    'HF-2208035-A',
    'HFA-62205091',
    'HFA-62306015',
    'HFA-62307017',
    'HFA-62308014',
    'HFA-62308024',
    'HFA-62308039',
    'HFA-62308041',
    'HFA-62308052',
    'JY-20685',
    'JY-20709',
    'KI-62306012',
    'KY-2303082',
    'MIK-6829',
    'RUD-2403014',
    'SJA-2308035',
    'SN-2304055',
    'WF-151-0277',
    'YS-2208110-C',
    'BK-108-616',
    'BK-148-014',
    'BK-155-046',
    'COK-351-0091',
    'DO-6589',
    'DO-6629',
    'HCM-21335',
    'HFA-62307010',
    'HFA-62307013',
    'JIA-2308063',
    'JY-20687',
    'JY-20696',
    'JY-20700',
    'LA-301-0271',
    'SJI-802-0014',
    'SP-2206062',
    'YS-2308011',
    'JUS-24415-1',
    'YIN-2310142',
    'BAT-151-0245',
    'BOX-TO2306072',
    'DO-6586',
    'JUS-24349',
    'JY-20538-1MES',
    'LT-2308022',
    'SJU-2206056',
    'YIN-2308018',
    'YIN-2403006',
    'BK-108-540',
    'BK-144-103',
    'DO-6394PLI',
    'DO-6396',
    'BIA-22668',
    'BIA-2320',
    'BK-155-060',
    'BK-157-012',
    'BOX-301-0267',
    'COK-PO2402059',
    'HFA-62308010',
    'HFA-62308016',
    'HFA-62308022',
    'HFA-62308061',
    'LT-25277',
    'YIN-351-0100-1',
    'YS-801-0178',
    'BIA-2064',
    'BK-108-569',
    'BK-108-572',
    'BK-108-577',
    'BK-133-130',
    'DF-5649',
    'DF-6061',
    'LC-21840',
    'MIK-6383-A',
    'DA-251-0114-1',
    'COK-251-0241',
    'PMG-5247',
    'LA-2409065',
    'LP-351-0077',
    'LWI-2409174C',
    'NK-2308043',
    'SP-2409055',
    'SYN-2502043',
    'TD-251-0180',
    'WAL-1908009-2',
    'WI-C-201-0286',
    'YU-852-0013-3',
    'BK-150-016',
    'BK-155-043',
    'EB-801-0164',
    'FAYA-251-0323',
    'LA-801-0165',
    'AIM-2111027',
    'AIM-2202021',
    'BUE-2111017',
    'COF-2111043',
    'DA-2111024',
    'HFA-2111078',
    'HS-2205024',
    'JY-10877A',
    'JY-20319',
    'KY-1803048-6R',
    'KY-2112037',
    'LA-2002061-1',
    'LA-2102037',
    'LA-2202002',
    'NO-2202017',
    'NX-2002060-1A',
    'QI-2112011',
    'QI-2202006',
    'SJA-2102019A',
    'SJA-2112029',
    'SN-2112038',
    'SN-2112043',
    'SP-2112040',
    'SP-2202045',
    'VF-2112013',
    'WI-1911062-2',
    'YKK-2111020',
    'YKK-2111026',
    'YKK-2111063',
    'YU-2110009',
    'YU-2110025',
    'YU-2111002',
    'YU-2111003',
    'YU-2112015XMAS',
    'YU-2112016XMAS',
    'YU-2112017XMAS',
    'YU-2112018XMAS',
    'YU-2202015'
  ];
  var KNOWN_REFS = new Set(KNOWN_REFS_ARR.map(function(r){ return r.toUpperCase(); }));

  function tamIsRef(token) {
    if (!token) return false;
    return REF_RE.test(token) || KNOWN_REFS.has(token.toUpperCase());
  }

  function tamFindRefInRow(tokens) {
    // 1. Fast path: tokens[0]
    if (tamIsRef(tokens[0])) return tokens[0];
    // 2. Try joining adjacent pairs (PDF sometimes splits refs with spaces)
    for (var i = 0; i < tokens.length - 1; i++) {
      var j1 = tokens[i] + ' ' + tokens[i+1];
      if (KNOWN_REFS.has(j1.toUpperCase())) return j1;
      var j2 = tokens[i] + '-' + tokens[i+1];
      if (KNOWN_REFS.has(j2.toUpperCase())) return j2;
    }
    // 3. Scan remaining tokens
    for (var i = 1; i < tokens.length; i++) {
      if (tamIsRef(tokens[i])) return tokens[i];
    }
    return null;
  }


  function tamParseEU(s) { return parseFloat(String(s).replace(/\./g,'').replace(',','.')); }
  function tamRound2(n)  { return Math.round(n*100)/100; }
  function tamFmtEU(n) {
    if (n==null||isNaN(n)) return '—';
    return Number(n).toLocaleString('pt-PT',{minimumFractionDigits:2,maximumFractionDigits:2});
  }
  function tamEsc(s)       { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
  function tamCleanName(n) {
    return String(n||'')
      .replace(/\bModell\s*:\s*/gi, '')   // remove "Modell:" prefix
      .replace(/\b\d{8}\b/g, '')          // strip 8-digit customs codes that leak into name
      .replace(/44/g, '')                  // remove "44" (TAM Fashion embeds it in model names: El44vezia→Elvezia)
      .replace(/\s{2,}/g, ' ')            // collapse spaces left by removals
      .trim();
  }

  var GARMENT_WORDS = new Set([
    'Blouse','Dress','Skirt','Top','Trouser','Trousers','Cardigan','Pullover','Pullunder',
    'Culotte','Scarf','Jacket','Coat','Shirt','Leggings','Vest','Jumper','Sweater',
    'Blazer','Shorts','Pants','Tee','Tunic','Cape','Poncho','Bodysuit','Overall',
    'Jumpsuit','Romper','Light'
  ]);
  var BRANDS_SET = new Set(['hailys','zabaione']);

  function tamExtractTypeAndName(beforeHS) {
    // Strip HS codes, standalone numeric tokens, and "Modell:" prefix before parsing
    var cleaned = beforeHS
      .replace(/\bModell\s*:\s*/gi, '')   // remove "Modell:" prefix
      .replace(/\b\d{8}\b/g, '')          // strip 8-digit customs codes
      .replace(/\b\d{4,}\b/g, '')         // strip standalone 4+ digit numbers (colour codes etc.)
      .trim();
    var words = cleaned.split(/\s+/).filter(Boolean);
    var start = 0;
    while (start < words.length && BRANDS_SET.has(words[start].toLowerCase())) start++;
    var relevant = words.slice(start);
    if (!relevant.length) return { type:'', name:'' };
    if (relevant.length === 1) return { type:'', name:tamCleanName(relevant[0]) };
    var modelName   = tamCleanName(relevant[relevant.length-1]);
    var typeWords   = relevant.slice(0, relevant.length-1);
    var realGarment = typeWords.find(function(w){ return GARMENT_WORDS.has(w); });
    var abbrevs     = typeWords.filter(function(w){ return !GARMENT_WORDS.has(w); });
    var typeLabel   = realGarment
      ? (abbrevs.length ? realGarment+' '+abbrevs.join(' ') : realGarment)
      : typeWords.join(' ');
    return { type:typeLabel.trim(), name:modelName };
  }

  function tamGroupByRows(items) {
    if (!items.length) return [];
    var sorted = items.slice().sort(function(a,b){ return b.transform[5]-a.transform[5]; });
    var rows=[],cur=[sorted[0]],lastY=sorted[0].transform[5];
    for (var i=1;i<sorted.length;i++) {
      var y = sorted[i].transform[5];
      if (Math.abs(y-lastY)>3.5) {
        var row = cur.slice().sort(function(a,b){return a.transform[4]-b.transform[4];})
                     .map(function(x){return x.str.trim();}).filter(Boolean);
        if (row.length) rows.push(row);
        cur=[sorted[i]]; lastY=y;
      } else { cur.push(sorted[i]); }
    }
    var last = cur.slice().sort(function(a,b){return a.transform[4]-b.transform[4];})
                  .map(function(x){return x.str.trim();}).filter(Boolean);
    if (last.length) rows.push(last);
    return rows;
  }

  function tamBuildGrouped(rawItems) {
    var map={};
    rawItems.forEach(function(item){
      if (!map[item.ref]) map[item.ref]={
        ref:item.ref, garmentType:item.garmentType, name:item.name,
        pieces:0, totalCost:0, lines:[]
      };
      var g=map[item.ref];
      g.pieces    += item.pieces;
      g.totalCost  = tamRound2(g.totalCost+item.total);
      g.lines.push(item);
      if (item.name)        g.name=item.name;
      if (item.garmentType) g.garmentType=item.garmentType;
    });
    return Object.values(map);
  }

  function tamFinalise(rawItems, tagged) {
    var grouped       = tamBuildGrouped(rawItems);
    var totalPieces   = grouped.reduce(function(s,g){return s+g.pieces;},0);
    var subtotalGoods = tamRound2(grouped.reduce(function(s,g){return s+g.totalCost;},0));
    var shipRow       = tagged.find(function(r){return r.type==='SHIP';});
    var shipping      = shipRow ? shipRow.cost     : 0;
    var shipPkgs      = shipRow ? shipRow.packages : 0;
    var shipPerPiece  = totalPieces>0 ? shipping/totalPieces : 0;
    grouped.forEach(function(g){
      var base=g.pieces>0?g.totalCost/g.pieces:0;
      g.unitPriceWithShip = tamRound2(base+shipPerPiece);
      g.grandTotal        = tamRound2(g.unitPriceWithShip*g.pieces);
    });
    var subtotalRows    = tagged.filter(function(r){return r.type==='SUBTOTAL';});
    var invoiceSubtotal = subtotalRows.length ? subtotalRows[0].value : null;
    // Invoice number: first INVOICENO tag found
    // Prefer INVOICENO row that also has a date (most reliable — same line as Datum/Date)
    var invNoRows  = tagged.filter(function(r){return r.type==='INVOICENO';});
    var invNoRow   = invNoRows.find(function(r){return r.date;}) || invNoRows[0] || null;
    var invDateRow = tagged.find(function(r){return r.type==='DATE';});
    var invoiceDate = (invNoRow && invNoRow.date) ? invNoRow.date
                    : invDateRow ? invDateRow.value
                    : '—';
    return {
      rawItems, grouped, totalPieces, subtotalGoods, shipping, shipPkgs, shipPerPiece,
      grandTotal:      tamRound2(subtotalGoods+shipping),
      invoiceSubtotal,
      invoiceNo:   invNoRow ? invNoRow.value : '—',
      invoiceDate: invoiceDate
    };
  }

  /* ────────────────────────────────────────────────────────────
     Common metadata tagger — used by all three engines
     Returns tagged rows array with INVOICENO / DATE / SHIP /
     SUBTOTAL / REF / OTHER.  DATA rows are engine-specific.
  ──────────────────────────────────────────────────────────── */
  function tamTagMeta(joined, tokens, idx) {
    // Invoice number — ZY- anywhere in the row, first occurrence
    // Also capture date if it appears on the same row as ZY- (Datum/Date 13.05.2022)
    var zyM = joined.match(ZY_RE);
    if (zyM) {
      var dateOnRow = null;
      if (joined.includes('Datum/Date')) {
        var dSame = joined.match(/(\d{2}\.\d{2}\.\d{4})/);
        if (dSame) dateOnRow = dSame[1];
      }
      return { idx:idx, type:'INVOICENO', value:zyM[1], date:dateOnRow };
    }

    if (joined.includes('Datum/Date')) {
      var dM = joined.match(/(\d{2}\.\d{2}\.\d{4})/);
      if (dM) return { idx:idx, type:'DATE', value:dM[1] };
    }
    if (/Versandkosten|Transportation costs/i.test(joined)) {
      var anzM = joined.match(/Anzahl\s+(\d+)\s+([\d.]*\d+,\d{2})/);
      if (anzM) return { idx:idx, type:'SHIP', packages:parseInt(anzM[1]), cost:tamParseEU(anzM[2]) };
    }
    if (/Zwischensumme.*Subtotal/i.test(joined)) {
      var nM = joined.match(/([\d.]*\d+,\d{2})\s*$/);
      if (nM) return { idx:idx, type:'SUBTOTAL', value:tamParseEU(nM[1]) };
    }
    return null; // not a meta row
  }

  /* ════════════════════════════════════════════════════════════
     ENGINE A — HS-code anchor + backward REF search
     Window: 40 rows (covers full page header/footer gap ~17 rows).
     Fallback: if backward search fails, use the nearest preceding
     REF anywhere in the document (handles edge cases where the gap
     exceeds even the extended window).
  ════════════════════════════════════════════════════════════ */
  function tamEngineA(allRows) {
    var tagged = allRows.map(function(tokens, idx){
      var joined = tokens.join(' ');
      var meta   = tamTagMeta(joined, tokens, idx);
      if (meta) return meta;

      // Always check if first token is a REF first, regardless of HS codes in row
      if (tamIsRef(tokens[0])) return { idx:idx, type:'REF', ref:tokens[0] };
      var _refA = tamFindRefInRow(tokens);
      if (_refA) return { idx:idx, type:'REF', ref:_refA };

      var hsM = joined.match(HS_RE);
      if (hsM) {
        var hsPos = joined.indexOf(hsM[1]);
        var after = joined.slice(hsPos+8).trim();
        var numM  = after.match(/^(\d{1,4})\s+([\d.]*\d+,\d{2})\s+([\d.]*\d+,\d{2})/);
        if (numM) {
          var pieces=parseInt(numM[1]), unitPrice=tamParseEU(numM[2]), total=tamParseEU(numM[3]);
          var tn=tamExtractTypeAndName(joined.slice(0,hsPos));
          return { idx:idx, type:'DATA', garmentType:tn.type, name:tn.name, pieces, unitPrice, total };
        }
      }
      return { idx:idx, type:'OTHER' };
    });

    // Build an ordered list of all REF positions for fallback lookup
    var refByIdx = {};
    tagged.forEach(function(t){ if (t.type==='REF') refByIdx[t.idx]=t; });
    var refIdxList = Object.keys(refByIdx).map(Number).sort(function(a,b){return a-b;});

    var rawItems=[];
    tagged.forEach(function(row){
      if (row.type!=='DATA') return;
      // Primary: backward search within 40 rows (covers page-break header/footer gap)
      var found = null;
      for (var j=row.idx-1; j>=Math.max(0,row.idx-40); j--) {
        if (tagged[j] && tagged[j].type==='REF') { found=tagged[j]; break; }
      }
      // Fallback: nearest preceding REF anywhere in document
      if (!found) {
        for (var k=refIdxList.length-1; k>=0; k--) {
          if (refIdxList[k] < row.idx) { found=refByIdx[refIdxList[k]]; break; }
        }
      }
      if (found) {
        rawItems.push({ ref:found.ref, garmentType:row.garmentType, name:row.name,
          pieces:row.pieces, unitPrice:row.unitPrice, total:row.total,
          valid:Math.abs(row.pieces*row.unitPrice-row.total)<0.02 });
      }
    });
    return tamFinalise(rawItems, tagged);
  }

  /* ════════════════════════════════════════════════════════════
     ENGINE B — forward state-machine
  ════════════════════════════════════════════════════════════ */
  function tamEngineB(allRows) {
    var tagged=[], currentRef=null, currentType='', currentName='';
    for (var i=0; i<allRows.length; i++) {
      var tokens=allRows[i], joined=tokens.join(' ');
      var meta=tamTagMeta(joined, tokens, i);
      if (meta) { tagged.push(meta); continue; }

      // Always check first token as REF before HS-blocking logic
      var _refB = tamIsRef(tokens[0]) ? tokens[0] : (!HS_RE.test(joined) ? tamFindRefInRow(tokens) : null);
      if (_refB) {
        currentRef=_refB; currentType=''; currentName='';
        tagged.push({ idx:i, type:'REF', ref:currentRef }); continue;
      }
      var hsM=joined.match(HS_RE);
      if (hsM && currentRef) {
        var hsPos=joined.indexOf(hsM[1]);
        var after=joined.slice(hsPos+8).replace(/\s*\*\s*$/,'').trim();
        var numM=after.match(/^(\d{1,4})\s+([\d.]*\d+,\d{2})\s+([\d.]*\d+,\d{2})/);
        if (numM) {
          var pieces=parseInt(numM[1]), unitPrice=tamParseEU(numM[2]), total=tamParseEU(numM[3]);
          var tn=tamExtractTypeAndName(joined.slice(0,hsPos));
          if (tn.name) currentName=tn.name;
          if (tn.type) currentType=tn.type;
          tagged.push({ idx:i, type:'DATA', ref:currentRef, garmentType:currentType,
                        name:currentName, pieces, unitPrice, total }); continue;
        }
      }
      tagged.push({ idx:i, type:'OTHER' });
    }
    var rawItems=[];
    tagged.forEach(function(row){
      if (row.type!=='DATA') return;
      rawItems.push({ ref:row.ref, garmentType:row.garmentType, name:row.name,
        pieces:row.pieces, unitPrice:row.unitPrice, total:row.total,
        valid:Math.abs(row.pieces*row.unitPrice-row.total)<0.02 });
    });
    return tamFinalise(rawItems, tagged);
  }

  /* ════════════════════════════════════════════════════════════
     ENGINE C — math-first triplet strategy
     Finds numeric triplets where pieces×unit≈total.
     Guards: pieces 1–500, unit 0.01–99.99, total>0.
     On multiple matches in same row, takes largest total.
     REF assignment: nearest preceding REF within 30 rows.
  ════════════════════════════════════════════════════════════ */
  function tamEngineC(allRows) {
    var NOISE_RE=/Kunden|Konto|Datum|Seite|TAM FASHION|Wakzome|Hauptsitz|IBAN|Fon|Fax|eMail|Liefer|steuer|Paket|Bruttogewicht|Netto/i;
    var NUM_RE=/\b(\d{1,3})\s+([\d]{1,2}(?:\.\d{3})*,\d{2})\s+([\d]{1,3}(?:\.\d{3})*,\d{2})\b/g;
    var tagged=[];

    for (var i=0; i<allRows.length; i++) {
      var tokens=allRows[i], joined=tokens.join(' ');
      var meta=tamTagMeta(joined, tokens, i);
      if (meta) { tagged.push(meta); continue; }
      if (NOISE_RE.test(joined)) { tagged.push({ idx:i, type:'OTHER' }); continue; }

      var _refC = tamIsRef(tokens[0]) ? tokens[0] : (!HS_RE.test(joined) ? tamFindRefInRow(tokens) : null);
      if (_refC) { tagged.push({ idx:i, type:'REF', ref:_refC }); continue; }

      // Engine C skips rows with HS codes — Engines A/B handle those with better precision.
      // Applying math-first on HS-code rows risks finding false triplets from nearby digits.
      if (HS_RE.test(joined)) { tagged.push({ idx:i, type:'OTHER' }); continue; }

      var rowStr=joined.replace(/\s*\*\s*/g,' ');
      NUM_RE.lastIndex=0;
      var m, best=null;
      while ((m=NUM_RE.exec(rowStr))!==null) {
        var pieces=parseInt(m[1]), unitPrice=tamParseEU(m[2]), total=tamParseEU(m[3]);
        if (pieces<1||pieces>500)    continue;
        if (unitPrice<=0||unitPrice>=100) continue;
        if (total<=0)                continue;
        if (Math.abs(tamRound2(pieces*unitPrice)-total)>=0.02) continue;
        if (!best||total>best.total) {
          var tn=tamExtractTypeAndName(rowStr.slice(0,m.index));
          best={ pieces, unitPrice, total, tn };
        }
      }
      if (best) {
        tagged.push({ idx:i, type:'DATA_C', garmentType:best.tn.type, name:best.tn.name,
                      pieces:best.pieces, unitPrice:best.unitPrice, total:best.total,
                      idx:i }); continue;
      }
      tagged.push({ idx:i, type:'OTHER' });
    }

    var refPositions=tagged.filter(function(t){return t.type==='REF';});
    var rawItems=[];
    tagged.forEach(function(row){
      if (row.type!=='DATA_C') return;
      var nearest=null, minDist=999;
      refPositions.forEach(function(r){
        var dist=row.idx-r.idx;
        if (dist>0&&dist<30&&dist<minDist){ minDist=dist; nearest=r; }
      });
      if (!nearest) { // try forward (≤5)
        refPositions.forEach(function(r){
          var dist=r.idx-row.idx;
          if (dist>0&&dist<=5&&dist<minDist){ minDist=dist; nearest=r; }
        });
      }
      if (nearest) rawItems.push({ ref:nearest.ref, garmentType:row.garmentType, name:row.name,
        pieces:row.pieces, unitPrice:row.unitPrice, total:row.total, valid:true });
    });
    return tamFinalise(rawItems, tagged);
  }

  /* ════════════════════════════════════════════════════════════
     CROSS-VALIDATION (2 engines: A and B only)
     Motor C runs internally but is never shown to the user.
     manualLabel: 'A'|'B'|null
  ════════════════════════════════════════════════════════════ */
  function tamCrossValidate(resA, resB, resC, manualLabel) {
    function score(res){
      if (!res.grouped.length) return 9999;
      if (res.invoiceSubtotal==null) return 5000-res.grouped.length;
      return Math.abs(res.invoiceSubtotal-res.subtotalGoods);
    }
    // Only score A and B — C is internal only
    var scoreA = score(resA), scoreB = score(resB);
    var autoLabel   = scoreA <= scoreB ? 'A' : 'B';
    var activeLabel = (manualLabel==='A'||manualLabel==='B') ? manualLabel : autoLabel;
    var activeRes   = activeLabel==='A' ? resA : resB;

    var mapA={}, mapB={};
    resA.grouped.forEach(function(g){ mapA[g.ref]=g; });
    resB.grouped.forEach(function(g){ mapB[g.ref]=g; });

    var confirmed=0, conflicts=[];
    var activeGrouped = activeRes.grouped.map(function(g){
      var a=mapA[g.ref], b=mapB[g.ref];
      if (a && b) {
        if (a.pieces===b.pieces && Math.abs(a.totalCost-b.totalCost)<0.02) {
          confirmed++;
          return Object.assign({},g,{confidence:'CONFIRMED'});
        } else {
          var detailParts=[];
          detailParts.push('A: '+a.pieces+' un / '+tamFmtEU(a.totalCost)+'€');
          detailParts.push('B: '+b.pieces+' un / '+tamFmtEU(b.totalCost)+'€');
          conflicts.push({ref:g.ref, detail:detailParts.join(' · ')});
          return Object.assign({},g,{confidence:'CONFLICT', conflictDetail:detailParts.join(' · ')});
        }
      }
      confirmed++;
      return Object.assign({},g,{confidence:'CONFIRMED'});
    });

    var totalPieces   = activeGrouped.reduce(function(s,g){return s+g.pieces;},0);
    var subtotalGoods = tamRound2(activeGrouped.reduce(function(s,g){return s+g.totalCost;},0));
    var shipping  = activeRes.shipping  || resA.shipping  || resB.shipping;
    var shipPkgs  = activeRes.shipPkgs  || resA.shipPkgs  || resB.shipPkgs;
    var shipPerPiece = totalPieces>0 ? shipping/totalPieces : 0;
    activeGrouped.forEach(function(g){
      var base=g.pieces>0?g.totalCost/g.pieces:0;
      g.unitPriceWithShip=tamRound2(base+shipPerPiece);
      g.grandTotal=tamRound2(g.unitPriceWithShip*g.pieces);
    });

    var meta = resA.invoiceNo!=='—' ? resA : resB;
    var fullyAgree = conflicts.length===0 &&
                     activeGrouped.every(function(g){return g.confidence==='CONFIRMED';});

    // Build engine info for display (A and B only)
    var enginesInfo = [
      {label:'A', res:resA, score:scoreA},
      {label:'B', res:resB, score:scoreB}
    ];

    return {
      grouped:activeGrouped, rawItems:activeRes.rawItems,
      totalPieces, subtotalGoods, shipping, shipPkgs, shipPerPiece,
      grandTotal:      tamRound2(subtotalGoods+shipping),
      invoiceSubtotal: meta.invoiceSubtotal,
      invoiceNo:       meta.invoiceNo,
      invoiceDate:     meta.invoiceDate,
      xv:{
        confirmed, conflicts, fullyAgree,
        autoEngine:  autoLabel,
        activeEngine:activeLabel,
        isManual:    !!manualLabel,
        engines: enginesInfo.map(function(e){
          return { label:e.label, refs:e.res.grouped.length,
                   units:e.res.totalPieces, sub:e.res.subtotalGoods, score:tamRound2(e.score) };
        })
      }
    };
  }

  /* ════════════════════════════════════════════════════════════
     RENDER: META
  ════════════════════════════════════════════════════════════ */
  function tamRenderMeta(r) {
    document.getElementById('tam-status-msg').textContent=
      (r.invoiceNo!=='—' ? r.invoiceNo+'  ·  ' : '')+
      r.grouped.length+' referências · '+r.totalPieces+' unidades';

    var el=document.getElementById('tam-invoice-meta');
    el.innerHTML=
      '<div class="tam-mi"><em>fatura nº</em><strong>'+tamEsc(r.invoiceNo)+'</strong></div>'+
      '<div class="tam-mi"><em>data</em><strong>'+tamEsc(r.invoiceDate)+'</strong></div>'+
      '<div class="tam-mi"><em>fornecedor</em><strong>TAM Fashion GmbH</strong></div>'+
      '<div class="tam-mi"><em>cliente</em><strong>Wakzome LDA</strong></div>'+
      '<div class="tam-mi"><em>referências</em><strong>'+r.grouped.length+'</strong></div>'+
      '<div class="tam-mi"><em>total unidades</em><strong>'+r.totalPieces+'</strong></div>'+
      '<div class="tam-mi"><em>envio (pacotes)</em><strong>'+r.shipPkgs+'</strong></div>';
    el.classList.add('show');
    el.style.cssText = 'display:flex!important;flex-wrap:wrap;gap:10px 20px;padding:10px 0;visibility:visible;opacity:1';
  }

  /* ════════════════════════════════════════════════════════════
     RENDER: VALIDATION BANNER
     Motor selector is ALWAYS shown when there is divergence,
     regardless of whether user already chose one.
     Clicking a motor button rebuilds from that engine.
  ════════════════════════════════════════════════════════════ */
  function tamRenderValidation(r) {
    var el  = document.getElementById('tam-validation-banner');
    var xv  = r.xv;
    var subOk = r.invoiceSubtotal!=null ? Math.abs(r.invoiceSubtotal-r.subtotalGoods)<0.05 : true;
    var allOk = xv.fullyAgree && subOk;

    var subLine = r.invoiceSubtotal!=null
      ? 'fatura: <strong>'+tamFmtEU(r.invoiceSubtotal)+'€</strong> · calculado: <strong>'+tamFmtEU(r.subtotalGoods)+'€</strong>'
      : 'calculado: <strong>'+tamFmtEU(r.subtotalGoods)+'€</strong>';

    var cvHtml='';

    if (allOk) {
      cvHtml='<div class="tam-vi" style="color:#2a7a2a"><em>verificação</em>'+
             '<span>✅ motores A e B coincidem · <strong>'+xv.confirmed+' refs confirmadas</strong></span></div>';
    } else {
      // Show A vs B stats
      var engA=xv.engines[0], engB=xv.engines[1];
      function _eKey(e){return e.refs+'|'+e.units+'|'+tamFmtEU(e.sub);}
      var abAgree = _eKey(engA)===_eKey(engB);

      if (abAgree) {
        cvHtml+='<div class="tam-vi"><em>motores</em><span style="white-space:nowrap">'+
          'Motor <strong>A+B ★</strong>: '+engA.refs+' refs / '+engA.units+' un / '+tamFmtEU(engA.sub)+'€'+
          '</span></div>';
      } else {
        cvHtml+='<div class="tam-vi"><em>motores</em><span style="white-space:nowrap">'+
          'Motor <strong>A'+(engA.label===xv.autoEngine?' ★':'')+'</strong>: '+engA.refs+' refs / '+engA.units+' un / '+tamFmtEU(engA.sub)+'€'+
          '&emsp;&emsp;'+
          'Motor <strong>B'+(engB.label===xv.autoEngine?' ★':'')+'</strong>: '+engB.refs+' refs / '+engB.units+' un / '+tamFmtEU(engB.sub)+'€'+
          '</span></div>';
      }

      if (xv.confirmed>0 && !abAgree)
        cvHtml+='<div class="tam-vi"><em>coincidências</em><span><strong>'+xv.confirmed+'</strong> refs iguais em A e B</span></div>';

      if (xv.conflicts.length) {
        var cLines=xv.conflicts.map(function(c){
          return '<span class="tam-conflict-ref">'+tamEsc(c.ref)+'</span> ('+tamEsc(c.detail)+')';
        }).join('<br>');
        cvHtml+='<div class="tam-vi"><em style="color:#c00">⚠️ conflitos ('+xv.conflicts.length+')</em><span>'+cLines+'</span></div>';
      }

      // Motor selector — only show if A and B differ
      if (!abAgree) {
        var selectorBtns = xv.engines.map(function(e, rank){
          var isActive = e.label===xv.activeEngine;
          var cls='tam-ebtn'+(isActive?' tam-ebtn-active':'');
          var star = e.label===xv.autoEngine ? ' ★' : '';
          var er = tamEngineResults[e.label];
          return '<button class="'+cls+'" data-engine="'+e.label+'">'+
                   '<span class="tam-ebtn-label">'+(rank+1)+'. Motor '+e.label+star+'</span>'+
                   '<span class="tam-ebtn-detail">'+e.refs+' refs · '+e.units+' un<br>'+tamFmtEU(er?er.subtotalGoods:0)+' €</span>'+
                 '</button>';
        }).join('');

        cvHtml+=
          '<div class="tam-vi tam-engine-sel-wrap">'+
            '<em>'+(xv.isManual ? 'motor activo (manual)' : 'seleccionar motor')+'</em>'+
            '<span class="tam-engine-btns">'+selectorBtns+'</span>'+
          '</div>';
      }
    }

    var badLines=r.rawItems.filter(function(i){return !i.valid;});
    el.innerHTML=
      '<div class="tam-vi"><em>estado</em><span>'+(allOk?'✅ fatura correcta':'⚠️ verificar itens marcados')+'</span></div>'+
      '<div class="tam-vi"><em>subtotal mercadoria</em><span>'+subLine+'</span></div>'+
      '<div class="tam-vi"><em>linhas verificadas</em><span>'+
        '<strong>'+(r.rawItems.length-badLines.length)+'/'+r.rawItems.length+'</strong> correctas'+
        (badLines.length?' · <strong style="color:#c00">'+badLines.length+' com erro</strong>':'')+'</span></div>'+
      cvHtml+
      '<div class="tam-vi"><em>transporte/unidade</em><span>'+
        '<strong>'+tamFmtEU(r.shipping)+'€</strong> ÷ '+r.totalPieces+' = '+
        '<strong>'+tamFmtEU(r.shipPerPiece)+'€/un</strong></span></div>';

    el.className = allOk ? 'ok' : 'err';

    // Bind motor buttons
    el.querySelectorAll('.tam-ebtn').forEach(function(btn){
      btn.addEventListener('click', function(){
        var label = btn.getAttribute('data-engine');
        tamActiveEngine = label;
        var newResult = tamCrossValidate(
          tamEngineResults.A, tamEngineResults.B, tamEngineResults.C, label
        );
        tamApplyResult(newResult);
      });
    });
  }

  /* ════════════════════════════════════════════════════════════
     RENDER: TABLE
     · table-layout:fixed with explicit pixel widths on <col>
     · nome column: fixed width 220px, text truncates with ellipsis
     · numeric columns: right-aligned, no wrap, padding for breathing room
  ════════════════════════════════════════════════════════════ */
  function tamRenderTable(r) {
    if (!r.grouped.length) return;

    var html=
      '<table class="tam-table">'+
      '<thead><tr>'+
        '<th class="tam-th">#</th>'+
        '<th class="tam-th">referência</th>'+
        '<th class="tam-th">tipo · nome</th>'+
        '<th class="tam-th">UND</th>'+
        '<th class="tam-th">P.Unit/T</th>'+
        '<th class="tam-th">Total</th>'+
      '</tr></thead><tbody>';

    r.grouped.forEach(function(g, i){
      var conf     = g.confidence||'CONFIRMED';
      var typeNome = (g.garmentType||'')+(g.garmentType&&g.name?' · ':'')+( g.name||'—');
      var rowCls   = conf==='CONFLICT' ? ' class="tam-row-conflict"' : '';
      var tooltip  = conf==='CONFLICT' ? ' title="'+tamEsc(g.conflictDetail||'')+'"' : '';
      var badge    = conf==='CONFLICT'
        ? '<span class="tam-badge tam-badge-conflict">⚠</span>' : '';

      html+=
        '<tr'+rowCls+tooltip+'>'+
        '<td class="tam-td tam-td-num">'+  (i+1)+'</td>'+
        '<td class="tam-td"><strong>'+tamEsc(g.ref)+'</strong>'+badge+'</td>'+
        '<td class="tam-td">'+tamEsc(typeNome)+'</td>'+
        '<td class="tam-td tam-td-num">'+g.pieces+'</td>'+
        '<td class="tam-td tam-td-num">'+tamFmtEU(g.unitPriceWithShip)+'</td>'+
        '<td class="tam-td tam-td-num"><strong>'+tamFmtEU(g.grandTotal)+'</strong></td>'+
        '</tr>';
    });

    html+=
      '</tbody><tfoot>'+
      '<tr class="tam-tr-sub">'+
        '<td class="tam-td"></td>'+
        '<td class="tam-td" colspan="2"><strong>subtotal mercadoria</strong></td>'+
        '<td class="tam-td tam-td-num"><strong>'+r.totalPieces+'</strong></td>'+
        '<td class="tam-td"></td>'+
        '<td class="tam-td tam-td-num"><strong>'+tamFmtEU(r.subtotalGoods)+'</strong></td>'+
      '</tr>'+
      '<tr class="tam-tr-ship">'+
        '<td class="tam-td"></td>'+
        '<td class="tam-td" colspan="2">transporte · '+r.shipPkgs+' pac. × 17,50 €</td>'+
        '<td class="tam-td"></td><td class="tam-td"></td>'+
        '<td class="tam-td tam-td-num">'+tamFmtEU(r.shipping)+'</td>'+
      '</tr>'+
      '<tr class="tam-tr-grand">'+
        '<td class="tam-td"></td>'+
        '<td class="tam-td" colspan="2"><strong>total geral</strong></td>'+
        '<td class="tam-td tam-td-num"><strong>'+r.totalPieces+'</strong></td>'+
        '<td class="tam-td"></td>'+
        '<td class="tam-td tam-td-num"><strong>'+tamFmtEU(r.grandTotal)+'</strong></td>'+
      '</tr>'+
      '</tfoot></table>';

    document.getElementById('tam-results-wrap').innerHTML=html;
  }

  /* ════════════════════════════════════════════════════════════
     STYLES (injected once)
  ════════════════════════════════════════════════════════════ */
  function tamEnsureStyles(){
    if (document.getElementById('tam-xv-styles')) return;
    var s=document.createElement('style');
    s.id='tam-xv-styles';
    s.textContent=[
      /* ── Table: auto-fit each column to its widest content ── */
      '.tam-table{table-layout:auto;width:100%;border-collapse:collapse;font-size:.85rem}',
      '.tam-th{white-space:nowrap;padding:6px 14px;text-align:center;font-size:.65rem;'+
              'text-transform:uppercase;letter-spacing:.06em;color:#888;border-bottom:2px solid #e0e0e0}',
      '.tam-td{white-space:nowrap;padding:6px 14px;text-align:center;border-bottom:1px solid #f0f0f0;vertical-align:middle}',
      '.tam-td-num{font-variant-numeric:tabular-nums}',
      /* Row states */
      '.tam-row-conflict td{background:#fff8e1!important}',
      /* Tfoot rows */
      '.tam-tr-sub td{border-top:2px solid #e0e0e0;padding:6px 14px;text-align:center}',
      '.tam-tr-ship td{padding:4px 14px;text-align:center;color:#888;font-size:.82rem}',
      '.tam-tr-grand td{border-top:2px solid #333;padding:8px 14px;text-align:center;font-size:.92rem}',
      /* Badges */
      '.tam-badge{display:inline-block;margin-left:5px;font-size:.6rem;padding:1px 5px;'+
                 'border-radius:3px;vertical-align:middle;font-weight:bold;color:#fff}',
      '.tam-badge-conflict{background:#e67e00}',
      '.tam-conflict-ref{font-weight:bold;color:#c00}',
      /* Invoice meta panel */
      '#tam-invoice-meta.show{display:flex!important;flex-wrap:wrap;gap:10px 24px;padding:10px 0}',
      '#tam-invoice-meta .tam-mi{display:flex;flex-direction:column;gap:2px;min-width:110px}',
      '#tam-invoice-meta .tam-mi em{font-style:normal;font-size:.62rem;text-transform:uppercase;letter-spacing:.05em;color:#888}',
      '#tam-invoice-meta .tam-mi strong{font-size:.88rem;color:#111}',
      /* Motor selector */
      '.tam-engine-sel-wrap{grid-column:1/-1;width:100%;margin-top:4px}',
      '.tam-engine-btns{display:flex;gap:8px;margin-top:6px;justify-content:center;flex-wrap:wrap}',
      '.tam-ebtn{border:1px solid #ccc;background:#fafafa;padding:7px 20px;border-radius:8px;'+
                'cursor:pointer;font-family:inherit;font-size:.78rem;line-height:1.45;text-align:center;'+
                'transition:background .15s,border-color .15s,color .15s;min-width:110px}',
      '.tam-ebtn:hover{background:#f0f0f0;border-color:#777}',
      '.tam-ebtn-active{background:#222!important;color:#fff!important;border-color:#222!important}',
      '.tam-ebtn-active:hover{background:#444!important}',
      '.tam-ebtn-label{display:block;font-weight:bold;font-size:.82rem}',
      '.tam-ebtn-detail{display:block;font-size:.68rem;opacity:.75;margin-top:2px}'
    ].join('');
    document.head.appendChild(s);
  }

  /* ════════════════════════════════════════════════════════════
     EXPORT CSV
  ════════════════════════════════════════════════════════════ */
  document.getElementById('tam-export-btn').addEventListener('click', function(){
    if (!tamCurrentResult) return;
    var r=tamCurrentResult;
    var lines=['\uFEFF'+['Referência','Tipo · Nome','UND','P.Unit c/ Envio (€)','Total (€)','Verificação'].join(';')];
    r.grouped.forEach(function(g){
      var tn=(g.garmentType||'')+(g.garmentType&&g.name?' · ':'')+(g.name||'');
      lines.push([g.ref,tn,g.pieces,tamFmtEU(g.unitPriceWithShip),tamFmtEU(g.grandTotal),g.confidence||'CONFIRMED'].join(';'));
    });
    lines.push('');
    lines.push(['Subtotal mercadoria','',r.totalPieces,'',tamFmtEU(r.subtotalGoods),''].join(';'));
    lines.push(['Transporte ('+r.shipPkgs+' × 17,50 €)','','','',tamFmtEU(r.shipping),''].join(';'));
    lines.push(['Total geral','',r.totalPieces,'',tamFmtEU(r.grandTotal),''].join(';'));
    var blob=new Blob([lines.join('\r\n')],{type:'text/csv;charset=utf-8;'});
    var url=URL.createObjectURL(blob);
    var a=document.createElement('a');
    a.href=url; a.download='TAM_'+(r.invoiceNo||'fatura').replace(/[^a-zA-Z0-9_-]/g,'_')+'.csv';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function(){URL.revokeObjectURL(url);},1000);
  });

})();
