# ARS Character Creator Assistant

Assistente de criação de personagens para o [Advanced Roleplaying System (ARS)](https://gitlab.com/foundryprojects/systems/advanced-roleplay-system) no Foundry VTT v14. Cobre OSRIC 3.0, 1ª edição e 2ª edição, em português e inglês.

## Instalar

Feche o Foundry (ou volte à tela de configuração) e coloque a pasta `ars-character-creator` em `%LOCALAPPDATA%\FoundryVTT\Data\modules\`. Para manter a pasta onde está e só criar um atalho:

```powershell
New-Item -ItemType Junction -Path "$env:LOCALAPPDATA\FoundryVTT\Data\modules\ars-character-creator" -Target "C:\caminho\para\ars-character-creator"
```

Ative o módulo no mundo ARS. O **OSRIC Compendium** é recomendado: de lá vêm classes, raças, magias e equipamento. Sem ele o assistente usa as tabelas internas (sem magias).

## Usar

Barra lateral **Atores → Criar Personagem**, ou por macro:

```js
game.modules.get('ars-character-creator').api.open();
```

Passos: regras, atributos, raça, classe ou multiclasse, detalhes e PV, perícias, grimório, equipamento, revisão. O rascunho fica salvo no navegador.

A regra escolhida deve ser igual à **variante do sistema** nas configurações do ARS (0 = OSRIC, 1 = 1ª ed., 2 = 2ª ed.), porque tabelas de atributos, ataques e iniciativa vêm de lá. O assistente avisa quando não for.

Jogadores sem permissão para criar atores enviam o personagem ao mestre conectado, que confirma em uma janela.

## Configurações do mundo

| Opção | Efeito |
| --- | --- |
| Jogadores podem usar o criador | Mostra o botão aos jogadores |
| Travar regras na variante do mundo | Só permite a regra igual à do mundo |
| Jogadores podem digitar valores | Atributos, força 18/xx e ouro digitados |
| Jogadores podem ignorar restrições | Mestres sempre podem |
| Limite de rolagens de atributos | 0 = livre; outro valor limita também PV, ouro e 18/xx |
| Maior nível inicial | 1 a 20 |
| Enviar rolagens ao chat | Mostra as rolagens |
| Compêndios usados | Ids em ordem de prioridade, por exemplo `meu-modulo.itens, osric-compendium.items` |

## O que é gravado na ficha

- Atributos **antes** do ajuste racial (e já com o ajuste de idade, no OSRIC); o ajuste racial é um Active Effect do item de raça, como o ARS espera.
- Itens de raça e classe com nível, PV por nível, XP e bônus de XP, com as habilidades do nível inicial. As habilidades do compêndio mantêm o id original, então subir de nível na ficha continua concedendo as próximas.
- Salvaguardas, THAC0, slots de magia, moedas restantes, perícias com armas ligadas às armas compradas, e grimório com as magias escolhidas. Magias divinas são oferecidas pelo próprio ARS.

## Fontes das regras e limites

| Regra | Origem dos números |
| --- | --- |
| OSRIC 3.0 | **Player Guide 3.0**: 923 valores de XP, dados de vida, salvaguardas, ataque, slots de magia, talentos e requisitos de ancestralidade foram comparados com o PDF, sem diferenças. |
| 1ª e 2ª edição | Transcritas de memória das tabelas dos livros básicos, sem o livro para conferir. Revise antes de usar em campanha. |

Os dados ficam em `scripts/data/`.

### OSRIC 3.0: o que o assistente aplica

- Os quatro métodos de atributos do livro, ajustes por idade, e valores acima do máximo da ancestralidade reduzidos ao máximo.
- 18/00 vira Força 19. Constituição 19 lê "1" como "2" nos dados de vida.
- Multiclasse: soma Constituição, divide, descarta frações, mínimo de 1 PV por nível. O valor gravado na classe é ajustado para o ARS mostrar esse total.
- Penalidade opcional de 10, 15 ou 20% de XP por mínimos de classe não atingidos (caixa no passo Regras).
- Limite de idiomas extras, idioma de alinhamento e idade inicial da classe que começa mais velha.
- Correções sobre o compêndio, que segue o 2.2: porcentagens de ladrão, tamanhos, bônus de salvaguarda por Constituição, detecção do meio-elfo, preços, pesos e fatores de velocidade.

### OSRIC 3.0: o que observar

- As **descrições** de habilidades e magias continuam as do compêndio (2.2).
- O ARS só entende perícias com armas "a cada N níveis". O assistente usa os níveis do livro, mas na ficha o contador de ladrão, paladino e ranger avança um nível antes, e o de assassino um depois.
- A tabela de dados de vida do usuário de magia vai até 11 dados, embora o quadro da classe diga "max 10"; segui a tabela, como a errata não oficial.
- No 1º nível do ranger, o bônus de Constituição entra nos dois dados, como no compêndio; o livro não é explícito.
- Os mínimos de classe são conferidos antes do ajuste de idade, porque a idade depende da classe.

### Simplificações conhecidas

- Na 1ª edição o movimento racial segue o OSRIC (90 para anão, gnomo e halfling); os limites femininos de Força e os ajustes por idade não são aplicados; o halfling usa o limite da sub-raça mais comum (guerreiro 4).
- Na 2ª edição só há o núcleo: sem kits, esferas detalhadas, psiônicos ou manuais de classe. Os sacerdotes têm acesso a todas as magias divinas.
- Classes sem item no compêndio (todas da 2ª edição e o monge) recebem as habilidades do nível inicial apenas pelo nome; as futuras aparecem listadas na descrição da classe.
- Troca de classe para humanos (dual-class), bardo da 1ª edição e psiônicos não fazem parte da criação.
- Restrições de arma e armadura são avisos, não bloqueios.

## Testes

```powershell
$env:ARS_SRC = "C:\caminho\advanced-roleplay-system\src"; node --test tests/rules.test.mjs
```

Os testes montam todas as combinações válidas de raça e classe e validam cada item nos modelos de dados do ARS. `OSRIC_DUMP` (opcional) aponta para um JSON do pacote `osric-compendium.items`.
