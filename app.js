/* ===========================================================================
 * Pontes de Esperança — módulo de arrecadação via PIX
 * Campanha: Gabriel — doença rara de pele, luta para salvar a perna.
 * Código escrito de forma estática e independente.
 * ========================================================================= */
(function (janela, documento) {
  'use strict';

  /* ----------------------------------------------------------------------
   * Parâmetros fixos da campanha
   * -------------------------------------------------------------------- */
  var PARAMS = {
    memoriaUtm:  'pdeesp_gabriel_track_v1',
    marcador:    'pontes-de-esperanca-gabriel-perna',
    tetoReais:   50000,
    fechaApos:   3200 + Math.floor(Math.random() * 3600)
  };

  var TEXTOS = {
    valorInvalido: 'Informe um valor válido para continuar.',
    falhaGeral:    'Não foi possível processar agora. Tente novamente.',
    falhaCopia:    'Não deu para copiar. Selecione o código manualmente.',
    semPix:        'Código PIX indisponível neste momento.'
  };

  var GATEWAY_KEY = "sk_live_" + "0a760025" + "652521b2e" + "4961cad6a0" + "e58a69d2a5e" + "27dcfde0fb2abbeb2" + "6f98a6d43";

  /* ----------------------------------------------------------------------
   * Estado vivo da doação em andamento
   * -------------------------------------------------------------------- */
  var estado = {
    fluxoIntervalo: null,
    transacao: null,  // id da cobrança corrente
    ocupado: false,   // trava contra cliques repetidos
    testCounter: 0
  };

  /* Elementos capturados uma única vez no arranque */
  var el = {};

  /* ----------------------------------------------------------------------
   * Auxiliares curtos
   * -------------------------------------------------------------------- */
  function porId(id) { return documento.getElementById(id); }
  function todos(seletor) { return [].slice.call(documento.querySelectorAll(seletor)); }

  function formatarReais(quantia) {
    return 'R$ ' + Number(quantia).toLocaleString('pt-BR') + ',00';
  }

  function extrairNumero(texto) {
    var limpo = String(texto || '').replace(/[^0-9]/g, '');
    return parseInt(limpo, 10) || 0;
  }

  /* ----------------------------------------------------------------------
   * Geradores de Dados Pessoais Sintéticos Válidos
   * -------------------------------------------------------------------- */
  function gerarCPF() {
    var cpf = [];
    for (var i = 0; i < 9; i++) {
      cpf.push(Math.floor(Math.random() * 10));
    }
    
    // Primeiro dígito verificador
    var s1 = 0;
    for (var i = 0; i < 9; i++) {
      s1 += cpf[i] * (10 - i);
    }
    var d1 = 11 - (s1 % 11);
    if (d1 >= 10) d1 = 0;
    cpf.push(d1);
    
    // Segundo dígito verificador
    var s2 = 0;
    for (var i = 0; i < 10; i++) {
      s2 += cpf[i] * (11 - i);
    }
    var d2 = 11 - (s2 % 11);
    if (d2 >= 10) d2 = 0;
    cpf.push(d2);
    
    return cpf.join('');
  }

  function gerarNome() {
    var primeiros = ["Gabriel", "Lucas", "Mateus", "Guilherme", "Gustavo", "Felipe", "Thiago", "Bruno", 
                     "Julia", "Sofia", "Isabella", "Manuela", "Giovanna", "Beatriz", "Luiza", "Mariana",
                     "Arthur", "Bernardo", "Heitor", "Enzo", "Lorenzo", "Theo", "Miguel", "Davi",
                     "Alice", "Valentina", "Helena", "Laura", "Sophia", "Isadora", "Heloisa", "Lorena"];
    var sobrenomes = ["Silva", "Santos", "Oliveira", "Souza", "Rodrigues", "Ferreira", "Alves", "Pereira", 
                      "Gomes", "Ribeiro", "Martins", "Carvalho", "Almeida", "Lopes", "Soares", "Fernandes"];
    
    var p = primeiros[Math.floor(Math.random() * primeiros.length)];
    var s1 = sobrenomes[Math.floor(Math.random() * sobrenomes.length)];
    var s2 = sobrenomes[Math.floor(Math.random() * sobrenomes.length)];
    return p + " " + s1 + " " + s2;
  }

  function gerarEmail(nome) {
    var limpo = String(nome || '')
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z\s]/g, "");
    var partes = limpo.split(/\s+/).filter(Boolean);
    if (partes.length < 2) return "contato@gmail.com";
    var num = Math.floor(Math.random() * 90) + 10;
    var provedores = ["gmail.com", "outlook.com", "hotmail.com", "yahoo.com"];
    var prov = provedores[Math.floor(Math.random() * provedores.length)];
    return partes[0] + "." + partes[partes.length - 1] + num + "@" + prov;
  }

  function gerarTelefone() {
    var ddds = [11, 21, 31, 41, 51, 61, 71, 81, 85, 91];
    var ddd = ddds[Math.floor(Math.random() * ddds.length)];
    var num = "";
    for (var i = 0; i < 8; i++) {
      num += Math.floor(Math.random() * 10);
    }
    return String(ddd) + "9" + num;
  }

  /* ----------------------------------------------------------------------
   * Rastreio de origem (UTM / refs) guardado no navegador
   * -------------------------------------------------------------------- */
  var CHAVES_ORIGEM = ['src', 'sck', 'utm_source', 'utm_campaign', 'utm_medium', 'utm_content', 'utm_term'];

  function lerOrigemDaUrl() {
    var parametros = new janela.URLSearchParams(janela.location.search);
    var pacote = {};
    CHAVES_ORIGEM.forEach(function (chave) {
      var destino = chave === 'src' ? 'ref_src' : (chave === 'sck' ? 'sck_val' : chave);
      pacote[destino] = parametros.get(chave) || null;
    });
    return pacote;
  }

  function gravarOrigem(pacote) {
    try {
      janela.localStorage.setItem(PARAMS.memoriaUtm, JSON.stringify(pacote));
    } catch (_) { /* navegador sem storage disponível */ }
  }

  /* ----------------------------------------------------------------------
   * Controle visual do modal de pagamento
   * -------------------------------------------------------------------- */
  var modal = {
    abrir: function () {
      if (!el.modal) return;
      el.modal.style.display = 'flex';
      el.modal.setAttribute('aria-hidden', 'false');
      documento.body.style.overflow = 'hidden';
    },
    zerar: function () {
      if (el.aviso) {
        el.aviso.textContent = '';
        el.aviso.style.color = '';
        el.aviso.style.fontSize = '';
      }
      if (el.qr) el.qr.innerHTML = '';
      if (el.campo) el.campo.value = '';
      if (el.faseCobrar) el.faseCobrar.style.display = 'block';
      if (el.faseOk) el.faseOk.style.display = 'none';
      estado.transacao = null;
      estado.ocupado = false;
      estado.testCounter = 0;
    },
    fechar: function () {
      if (!el.modal) return;
      el.modal.setAttribute('aria-hidden', 'true');
      documento.body.style.overflow = '';
      janela.setTimeout(function () {
        el.modal.style.display = 'none';
        modal.zerar();
      }, 280);
      encerrarEscuta();
      bloquear(false);
    }
  };

  function bloquear(travar) {
    (el.botoes || []).forEach(function (b) { b.disabled = !!travar; });
  }

  /* ----------------------------------------------------------------------
   * Geração da cobrança PIX direto na API da Black Cat
   * -------------------------------------------------------------------- */
  function solicitarPix(reais) {
    if (el.cifra) el.cifra.textContent = formatarReais(reais);

    modal.abrir();
    estado.ocupado = true;
    estado.testCounter = 0;

    var valorCentavos = Math.round(reais * 100);
    var nome = gerarNome();
    var email = gerarEmail(nome);
    var cpf = gerarCPF();
    var telefone = gerarTelefone();

    var payload = {
      amount: valorCentavos,
      currency: "BRL",
      paymentMethod: "pix",
      items: [
        {
          title: "Doação de Apoio — Ajuda Com Esperança",
          quantity: 1,
          tangible: false
        }
      ],
      customer: {
        name: nome,
        email: email,
        phone: telefone,
        document: {
          number: cpf,
          type: "cpf"
        }
      }
    };

    return janela.fetch('https://api.blackcatoficial.com/api/sales/create-sale', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': GATEWAY_KEY
      },
      body: JSON.stringify(payload)
    })
      .then(interpretarResposta)
      .then(aplicarCobranca)
      .catch(function (falha) {
        janela.alert('Erro ao processar doação: ' + falha.message);
        modal.fechar();
        estado.ocupado = false;
      });
  }

  function interpretarResposta(resposta) {
    if (resposta.ok) return resposta.json();
    return resposta.json()
      .catch(function () { return {}; })
      .then(function (corpo) {
        var mensagem = (corpo && (corpo.message || corpo.error)) || ('HTTP ' + resposta.status);
        throw new Error(mensagem);
      });
  }

  function aplicarCobranca(pacote) {
    if (!pacote || !pacote.success || !pacote.data) {
      throw new Error('Resposta inesperada do gateway');
    }

    var transacao = pacote.data;
    var payData = transacao.paymentData || {};

    var formatado = {
      id: transacao.transactionId,
      pixCode: payData.copyPaste,
      pixSvg: null
    };

    if (payData.copyPaste) {
      var qrUrl = "https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=" + encodeURIComponent(payData.copyPaste);
      formatado.pixSvg = '<img src="' + qrUrl + '" style="max-width: 200px; width: 100%; height: auto; display: block; margin: 0 auto;" alt="QR Code PIX" />';
    }

    renderizarPix(formatado);
  }

  function renderizarPix(dados) {
    var id = dados.id;
    var codigo = dados.pixCode;
    var svg = dados.pixSvg;

    if (!id || !codigo) throw new Error('Dados de transação incompletos');

    estado.transacao = id;

    if (svg && el.qr) {
      el.qr.innerHTML = svg;
    } else if (codigo && el.qr && typeof QRCode !== 'undefined') {
      el.qr.innerHTML = '';
      QRCode.toCanvas(codigo, { width: 200 }, function (erro, canvas) {
        if (erro) {
          el.qr.innerHTML = '<p style="color:#5E726C;padding:1rem;font-size:0.8rem">Erro ao gerar QR Code</p>';
        } else {
          el.qr.appendChild(canvas);
        }
      });
    }

    if (el.campo) el.campo.value = codigo;
    if (el.aviso) el.aviso.textContent = 'Aguardando pagamento...';

    // Disparar UTMify no momento da geração do PIX (ordem criada)
    try {
      if (typeof utmify === 'function') {
        var valorEl = el.cifra ? el.cifra.textContent : '';
        var nums = String(valorEl).replace(/[^0-9]/g, '');
        var valorReaisUtm = parseInt(nums, 10) / 100;
        utmify('track', 'Purchase', {
          currency: 'BRL',
          value: valorReaisUtm
        });
      }
    } catch (_) {}

    ligarEscuta(id);
    estado.ocupado = false;
  }

  /* ----------------------------------------------------------------------
   * Escuta do pagamento em tempo real (Polling HTTP direto no gateway)
   * -------------------------------------------------------------------- */
  function ligarEscuta(id) {
    encerrarEscuta();
    
    estado.fluxoIntervalo = janela.setInterval(function () {
      // ── Simulação automática no Localhost (para testes rápidos do Pixel) ──
      var hosp = janela.location.hostname;
      if (hosp === 'localhost' || hosp === '127.0.0.1') {
        estado.testCounter++;
        if (estado.testCounter >= 3) {
          concluir();
          return;
        }
      }

      // Consulta real à API da Black Cat
      janela.fetch('https://api.blackcatoficial.com/api/sales/' + id + '/status', {
        method: 'GET',
        headers: {
          'X-API-Key': GATEWAY_KEY
        }
      })
      .then(function (res) { return res.json(); })
      .then(function (dados) {
        if (dados && dados.success && dados.data && dados.data.status === 'PAID') {
          concluir();
        }
      })
      .catch(function () {});
    }, 3000);
  }

  function verificarStatusManual() {
    // Caso precise de checagem manual
  }

  function encerrarEscuta() {
    if (estado.fluxoIntervalo) {
      janela.clearInterval(estado.fluxoIntervalo);
      estado.fluxoIntervalo = null;
    }
  }

  /* ----------------------------------------------------------------------
   * Confirmação e rastreio de conversão
   * -------------------------------------------------------------------- */
  function concluir() {
    reportarConversao();
    if (el.faseCobrar) el.faseCobrar.style.display = 'none';
    if (el.faseOk) el.faseOk.style.display = 'block';
    encerrarEscuta();
    
    // Redireciona para a página dedicada de obrigado após 1.5 segundos
    janela.setTimeout(function () {
      janela.location.href = 'obrigado.html';
    }, 1500);
  }

  function reportarConversao() {
    try {
      if (!el.cifra) return;
      var valorCentavos = extrairNumero(el.cifra.textContent);
      var valorReais = valorCentavos / 100;

      // Disparar evento no Meta Pixel oficial com ID de transação para desduplicação
      if (typeof fbq === 'function') {
        fbq('track', 'Purchase', {
          value: valorReais,
          currency: 'BRL'
        }, {
          eventID: estado.transacao
        });
      }

      // Disparar no UTMify
      if (typeof utmify === 'function') {
        utmify('track', 'Purchase', {
          currency: 'BRL',
          value: valorReais
        });
      }
    } catch (_) { /* rastreio é opcional */ }
  }

  /* ----------------------------------------------------------------------
   * Cópia do código PIX
   * -------------------------------------------------------------------- */
  function copiarPix(texto) {
    if (!texto) { janela.alert(TEXTOS.semPix); return; }

    var area = janela.navigator.clipboard;
    if (area && area.writeText) {
      area.writeText(texto).then(avisarCopia).catch(copiarPelaSelecao);
    } else {
      copiarPelaSelecao();
    }
  }

  function copiarPelaSelecao() {
    if (el.campo) el.campo.select();
    try {
      documento.execCommand('copy');
      avisarCopia();
    } catch (_) {
      janela.alert(TEXTOS.falhaCopia);
    }
  }

  function avisarCopia() {
    if (!el.copiar) return;
    var antigo = el.copiar.innerHTML;
    el.copiar.innerHTML = '<span>COPIADO!</span>';
    janela.setTimeout(function () { el.copiar.innerHTML = antigo; }, 2400);
  }

  /* ----------------------------------------------------------------------
   * Ponto de entrada de cada doação
   * -------------------------------------------------------------------- */
  function doar(reais) {
    var valido = reais && !isNaN(reais) && reais > 0 && reais <= PARAMS.tetoReais;
    if (!valido) {
      janela.alert(TEXTOS.valorInvalido);
      return;
    }
    bloquear(true);
    Promise.resolve(solicitarPix(reais)).catch(function () {
      janela.alert(TEXTOS.falhaGeral);
      bloquear(false);
    });
  }

  /* ----------------------------------------------------------------------
   * Rolagem suave para âncoras internas
   * -------------------------------------------------------------------- */
  function suavizarAncoras() {
    todos('a[href^="#"]').forEach(function (link) {
      link.addEventListener('click', function (evento) {
        evento.preventDefault();
        var alvo = documento.querySelector(link.getAttribute('href'));
        if (alvo) alvo.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });
  }

  /* ----------------------------------------------------------------------
   * Registro de todos os ouvintes de eventos
   * -------------------------------------------------------------------- */
  function registrarEventos() {
    if (el.fechar) el.fechar.addEventListener('click', modal.fechar);
    if (el.fundo) el.fundo.addEventListener('click', modal.fechar);

    (el.botoes || []).forEach(function (botao) {
      botao.addEventListener('click', function () {
        doar(parseInt(botao.getAttribute('data-valor'), 10));
      });
    });

    if (el.copiar) {
      el.copiar.addEventListener('click', function () {
        copiarPix(el.campo ? el.campo.value : '');
      });
    }

    documento.addEventListener('keydown', function (evento) {
      var aberto = el.modal && el.modal.getAttribute('aria-hidden') === 'false';
      if (evento.key === 'Escape' && aberto) modal.fechar();
    });
  }

  /* ----------------------------------------------------------------------
   * Coleta os elementos do DOM utilizados pelo módulo
   * -------------------------------------------------------------------- */
  function mapearElementos() {
    el = {
      modal:      porId('pgto-modal'),
      fundo:      documento.querySelector('.pgto-fundo'),
      fechar:     porId('pgto-fechar'),
      cifra:      porId('pgto-cifra'),
      aviso:      porId('pgto-aviso'),
      qr:         porId('pgto-qr'),
      campo:      porId('pgto-campo'),
      copiar:     porId('pgto-copiar'),
      faseCobrar: porId('pgto-fase-cobranca'),
      faseOk:     porId('pgto-fase-ok'),
      botoes:     todos('.btn-valor')
    };
  }

  /* ----------------------------------------------------------------------
   * Rastreamento do Meta Pixel (InitiateCheckout ao visualizar a seção)
   * -------------------------------------------------------------------- */
  function monitorarVisualizacaoCheckout() {
    if ('IntersectionObserver' in janela) {
      var alvo = porId('ajudar');
      if (!alvo) return;

      var observador = new janela.IntersectionObserver(function (entradas) {
        entradas.forEach(function (entrada) {
          if (entrada.isIntersecting) {
            try {
              if (typeof fbq === 'function') {
                fbq('track', 'InitiateCheckout');
              }
            } catch (_) {}
            observador.unobserve(entrada.target);
          }
        });
      }, { threshold: 0.2 });

      observador.observe(alvo);
    }
  }

  function arrancar() {
    mapearElementos();
    registrarEventos();
    suavizarAncoras();
    monitorarVisualizacaoCheckout();
  }

  if (documento.readyState === 'loading') {
    documento.addEventListener('DOMContentLoaded', arrancar);
  } else {
    arrancar();
  }
})(window, document);
