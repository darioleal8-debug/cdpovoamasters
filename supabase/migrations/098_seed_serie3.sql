-- 098_seed_serie3.sql
-- Seed: Jogada "Serie 3" do CD Póvoa — usada como teste de regressão visual

INSERT INTO public.plays (
  id, club, name, eyebrow, category, note,
  init, steps, options,
  status, published_at, created_at, updated_at
)
VALUES (
  '00000000-0000-0000-0000-000000000003',
  'default',
  'Serie 3',
  'CD Póvoa · Masters 2026/27 · Ataque',
  'Ataque',
  'A entrada (passos 1 e 2) é igual em todas as opções. Aqui 3 escolhe o lado direito; para o lado esquerdo a jogada é espelhada (4 e 5 trocam de papel).',
  -- init
  '{"pos":{"1":[250,345],"2":[250,215],"3":[250,85],"4":[160,145],"5":[340,145]},"ball":1}'::jsonb,
  -- steps
  $steps${
    "s1":{
      "title":"Entrada",
      "text":"3 escolhe o lado e sai pelo bloqueio do interior (5). 2 corta para o lado contrário, usando o bloqueio alto do outro interior (4). 1 passa a 3.",
      "moves":[
        {"p":5,"to":[328,118],"type":"screen","s":0,"e":0.25},
        {"p":3,"to":[420,235],"via":[385,80],"type":"cut","s":0.15,"e":0.65},
        {"p":4,"to":[192,200],"type":"screen","s":0,"e":0.3},
        {"p":2,"to":[75,200],"via":[170,255],"type":"cut","s":0.25,"e":0.72}
      ],
      "passes":[{"f":1,"t":3,"s":0.7,"e":0.95}]
    },
    "s2":{
      "title":"Bloqueio direto",
      "text":"O interior do lado da bola (5) sobe ao cotovelo do lado contrário. O outro interior (4) vai bloquear 3 e desfaz para o cesto. 3 sai em drible pelo bloqueio.",
      "moves":[
        {"p":4,"to":[398,262],"via":[310,255],"type":"screen","s":0,"e":0.4},
        {"p":5,"to":[178,192],"via":[255,105],"type":"cut","s":0.1,"e":0.55},
        {"p":3,"to":[335,290],"via":[400,315],"type":"dribble","s":0.45,"e":0.8},
        {"p":4,"to":[302,112],"via":[345,205],"type":"cut","s":0.6,"e":1}
      ]
    },
    "o1":{
      "title":"Passe ao bloqueador",
      "text":"Passe interior de 3 para 4, que desfez o bloqueio para o cesto. 4 finaliza junto ao cesto.",
      "moves":[{"p":4,"to":[266,74],"type":"cut","s":0.45,"e":0.85}],
      "passes":[{"f":3,"t":4,"s":0,"e":0.4}]
    },
    "o2pass":{
      "title":"Bola no cotovelo",
      "text":"Se 4 não estiver livre, 3 passa a 5, que está no cotovelo do lado contrário.",
      "passes":[{"f":3,"t":5,"s":0.1,"e":0.6}]
    },
    "o2a":{
      "title":"Hi-Lo 5 → 4",
      "text":"Hi-Lo: 5, no cotovelo, passa para 4 junto ao cesto. 4 finaliza.",
      "moves":[{"p":4,"to":[264,76],"type":"cut","s":0.55,"e":0.9}],
      "passes":[{"f":5,"t":4,"s":0.05,"e":0.45}]
    },
    "o2b":{
      "title":"Hand-off com 1",
      "text":"Se 5 não consegue o Hi-Lo com 4, faz hand-off (HO) com 1. 1 ataca o cesto em drible. 2 e 3 sobem aos cantos e 4 sai da zona para abrir espaço.",
      "moves":[
        {"p":2,"to":[42,70],"type":"cut","s":0,"e":0.45},
        {"p":3,"to":[458,80],"via":[470,220],"type":"cut","s":0,"e":0.5},
        {"p":4,"to":[290,165],"via":[330,140],"type":"cut","s":0.05,"e":0.45},
        {"p":1,"to":[150,228],"via":[170,330],"type":"cut","s":0,"e":0.45},
        {"p":1,"to":[232,78],"via":[135,115],"type":"dribble","s":0.55,"e":0.95},
        {"p":5,"to":[232,248],"type":"cut","s":0.55,"e":0.9}
      ],
      "passes":[{"f":5,"t":1,"s":0.45,"e":0.55,"ho":true}]
    },
    "o3a":{
      "title":"Continuidade",
      "text":"3 devolve a bola a 1. 5 sobe para fazer bloqueio direto (BD) central a 1. 4 abre para a ala e 2 sobe ao canto.",
      "moves":[
        {"p":5,"to":[228,322],"via":[190,270],"type":"screen","s":0.15,"e":0.65},
        {"p":4,"to":[442,178],"via":[380,120],"type":"cut","s":0.1,"e":0.6},
        {"p":2,"to":[45,78],"type":"cut","s":0.2,"e":0.65}
      ],
      "passes":[{"f":3,"t":1,"s":0,"e":0.35}]
    },
    "o3b":{
      "title":"BD central",
      "text":"1 sai em drible pelo bloqueio de 5. 5 rola para o cesto.",
      "moves":[
        {"p":1,"to":[178,318],"via":[215,385],"type":"dribble","s":0.05,"e":0.55},
        {"p":5,"to":[250,108],"via":[215,215],"type":"cut","s":0.3,"e":0.9}
      ]
    },
    "o3c":{
      "title":"Finalização",
      "text":"Termina com lançamento ou penetração de 1, ou passe para qualquer um dos colegas.",
      "options":[2,5,4,3]
    }
  }$steps$::jsonb,
  -- options
  $opts$[
    {"id":"o1",  "label":"Opção 1",  "sub":"Passe ao bloqueador","steps":["s1","s2","o1"]},
    {"id":"o2a", "label":"Opção 2a", "sub":"Hi-Lo 5 → 4",        "steps":["s1","s2","o2pass","o2a"]},
    {"id":"o2b", "label":"Opção 2b", "sub":"Hand-off com 1",     "steps":["s1","s2","o2pass","o2b"]},
    {"id":"o3",  "label":"Opção 3",  "sub":"BD central",         "steps":["s1","s2","o3a","o3b","o3c"]}
  ]$opts$::jsonb,
  'published',
  now(),
  now(),
  now()
)
ON CONFLICT (id) DO NOTHING;
