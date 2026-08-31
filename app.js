/* ===========================================================================
 * Pontes de Esperança — módulo de arrecadação via PIX
 * Campanha: Gabriel — doença rara de pele, luta para salvar a perna.
 * Código escrito de forma exclusiva para esta página. Não reaproveite.
 * ========================================================================= */
(function (janela, documento) {
  'use strict';

  /* ----------------------------------------------------------------------
   * Parâmetros fixos da campanha
   * -------------------------------------------------------------------- */
  var PARAMS = {
    rotaCriar:   '/api/generate',
    rotaEscuta:  '/api/status',
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

  /* ----------------------------------------------------------------------
   * Estado vivo da doação em andamento
   * -------------------------------------------------------------------- */
  var estado = {
    fluxo: null,      // EventSource ativo
    transacao: null,  // id da cobrança corrente
    ocupado: false    // trava contra cliques repetidos
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

  function lerOrigemGravada() {
    try {
      var bruto = janela.localStorage.getItem(PARAMS.memoriaUtm);
      return bruto ? JSON.parse(bruto) : {};
    } catch (_) {
      return {};
    }
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
   * Geração da cobrança PIX no servidor
   * -------------------------------------------------------------------- */
  function solicitarPix(reais) {
    var origem = lerOrigemGravada();
    if (el.cifra) el.cifra.textContent = formatarReais(reais);

    modal.abrir();
    estado.ocupado = true;

    return janela.fetch(PARAMS.rotaCriar, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amount_cents: reais * 100,
        utm_params: origem,
        metadata: PARAMS.marcador
      })
    })
      .then(interpretarResposta)
      .then(aplicarCobranca)
      .catch(function (falha) {
        janela.alert('Erro: ' + falha.message);
        modal.fechar();
        estado.ocupado = false;
      });
  }

  function interpretarResposta(resposta) {
    if (resposta.ok) return resposta.json();
    return resposta.json()
      .catch(function () { return {}; })
      .then(function (corpo) {
        var mensagem;
        if (corpo && typeof corpo.error === 'object') {
          mensagem = JSON.stringify(corpo.error);
        } else {
          mensagem = (corpo && (corpo.error || corpo.message)) || ('HTTP ' + resposta.status);
        }
        throw new Error(mensagem);
      });
  }

  function aplicarCobranca(pacote) {
    if (!pacote || !pacote.ok || !pacote.data) {
      throw new Error('Resposta inesperada do servidor');
    }

    var minutosRestantes = null;
    if (pacote.cached) {
      minutosRestantes = Math.ceil((pacote.remainingMs || 0) / 60000);
      if (pacote.originalAmountCents && el.cifra) {
        el.cifra.textContent = formatarReais(pacote.originalAmountCents / 100);
      }
    }

    renderizarPix(pacote.data, minutosRestantes);
  }

  function renderizarPix(dados, minutosRestantes) {
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

    if (minutosRestantes !== null && el.aviso) {
      el.aviso.textContent = 'PIX já gerado — válido por mais ' + minutosRestantes + ' min';
      el.aviso.style.color = '#5E726C';
      el.aviso.style.fontSize = '0.82rem';
    }

    ligarEscuta(id);
    estado.ocupado = false;
  }

  /* ----------------------------------------------------------------------
   * Escuta do pagamento em tempo real (Polling HTTP para Vercel Serverless)
   * -------------------------------------------------------------------- */
  function ligarEscuta(id) {
    encerrarEscuta();
    
    var intervalo = janela.setInterval(function () {
      janela.fetch(PARAMS.rotaEscuta + '/' + id)
        .then(function (res) { return res.json(); })
        .then(function (dados) {
          if (dados && dados.status === 'paid') {
            concluir();
          }
        })
        .catch(function () { /* ignorar falhas temporárias */ });
    }, 3000);

    estado.fluxo = {
      close: function () {
        janela.clearInterval(intervalo);
      }
    };
  }

  function encerrarEscuta() {
    if (estado.fluxo) {
      estado.fluxo.close();
      estado.fluxo = null;
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
        utmify('event', 'Purchase', {
          currency: 'BRL',
          value: valorCentavos
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
   * Arranque
   * -------------------------------------------------------------------- */
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
    gravarOrigem(lerOrigemDaUrl());
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
