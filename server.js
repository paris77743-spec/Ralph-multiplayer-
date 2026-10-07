const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, "public")));

const questions = [
  { q:"Quem é a melhor amiga de Ralph?", a:["Vanellope von Schweetz","Shank","Yesss","Sergeant Calhoun"], c:0, p:1 },
  { q:"Para onde Ralph e Vanellope vão durante a aventura?", a:["Para a Internet","Para a Lua","Para uma escola","Para uma ilha"], c:0, p:1 },
  { q:"O que faz Ralph e Vanellope entrarem na Internet?", a:["Um novo console é conectado ao fliperama","Eles recebem um convite","Um computador aparece","Eles encontram um celular"], c:0, p:2 },
  { q:"Qual é um dos principais temas do filme?", a:["Amizade e mudanças","Viagens no tempo","Piratas","Futebol"], c:0, p:2 },
  { q:"Do que a Vanellope gosta?", a:["De correr e participar de corridas de carros","De jogar xadrez","De jogar futebol","De jogar cartas"], c:0, p:1 },
  { q:"Qual atitude é mais segura na Internet?", a:["Não compartilhar senhas","Passar a senha para qualquer pessoa","Clicar em todo link","Publicar dados pessoais"], c:0, p:2 },
  { q:"Se uma pessoa desconhecida pedir seus dados pessoais, o que fazer?", a:["Não compartilhar e procurar um adulto de confiança","Enviar tudo","Mandar apenas a senha","Ignorar e continuar conversando"], c:0, p:2 },
  { q:"No filme, Ralph demonstra muito medo de...", a:["Perder a amizade de Vanellope","Água","Altura","Ficar sem comida"], c:0, p:2 },
  { q:"O que podemos aprender sobre amizade com o filme?", a:["É importante respeitar as escolhas do amigo","Devemos controlar o amigo","Amigos nunca mudam","Devemos esconder nossos sentimentos"], c:0, p:2 },
  { q:"Qual comportamento ajuda a ter uma boa convivência online?", a:["Respeitar as pessoas","Ofender quem discorda","Compartilhar boatos","Criar contas falsas para provocar"], c:0, p:2 },
  { q:"O que devemos fazer antes de clicar em um link suspeito?", a:["Verificar se é confiável","Clicar rapidamente","Enviar para todos","Informar a senha"], c:0, p:3 },
  { q:"Por que não devemos compartilhar informações pessoais na Internet com desconhecidos?", a:["Para proteger nossa privacidade e segurança","Porque a Internet não funciona","Porque é proibido usar nomes","Porque ninguém usa informações online"], c:0, p:3 },
  { q:"Qual personagem ajuda Ralph e Vanellope em parte da aventura?", a:["Yesss","Mickey Mouse","Elsa","Superman"], c:0, p:2 },
  { q:"O que significa agir com responsabilidade na Internet?", a:["Pensar antes de postar, compartilhar ou responder","Fazer tudo sem pensar","Compartilhar qualquer notícia","Usar a Internet para brigar"], c:0, p:3 },
  { q:"Qual é uma mensagem importante do filme?", a:["Amizade também significa respeitar a liberdade e as mudanças do outro","Devemos impedir nossos amigos de mudar","A Internet resolve todos os problemas","Ser famoso é mais importante que amizade"], c:0, p:3 }
];

const rooms = new Map();

function code() {
  let s;
  do { s = Math.random().toString(36).slice(2,6).toUpperCase(); } while (rooms.has(s));
  return s;
}
function shuffledQuestions() {
  return questions.map(src => {
    const opts = src.a.map((text, index) => ({text, correct:index === src.c}));
    for (let i = opts.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [opts[i], opts[j]] = [opts[j], opts[i]];
    }
    return {
      q: src.q,
      a: opts.map(x => x.text),
      c: opts.findIndex(x => x.correct),
      p: src.p
    };
  }).sort(() => Math.random() - 0.5);
}
function cleanName(n) {
  return String(n || "").trim().replace(/[<>]/g,"").slice(0,20);
}
function publicRoom(room) {
  return {
    code: room.code,
    host: room.host,
    state: room.state,
    current: room.current,
    total: room.questions.length,
    players: [...room.players.values()].map(p => ({
      id:p.id, name:p.name, score:p.score, answered:p.answered
    })),
    question: room.state === "playing" ? {
      q:room.questions[room.current].q,
      a:room.questions[room.current].a,
      p:room.questions[room.current].p,
      endsAt:room.endsAt
    } : null
  };
}
function broadcast(room) {
  io.to(room.code).emit("room:update", publicRoom(room));
}
function ranking(room) {
  return [...room.players.values()]
    .sort((a,b)=>b.score-a.score || a.totalTime-b.totalTime)
    .map((p,i)=>({rank:i+1,name:p.name,score:p.score}));
}
function finishQuestion(room) {
  if (!rooms.has(room.code) || room.state !== "playing") return;
  room.state = "ranking";
  clearTimeout(room.timer);
  io.to(room.code).emit("question:result", {
    correct: room.questions[room.current].c,
    ranking: ranking(room)
  });
  broadcast(room);
}
function startQuestion(room) {
  room.state = "playing";
  room.players.forEach(p => p.answered=false);
  room.endsAt = Date.now() + 15000;
  clearTimeout(room.timer);
  room.timer = setTimeout(()=>finishQuestion(room),15000);
  broadcast(room);
}
function nextQuestion(room) {
  room.current++;
  if (room.current >= room.questions.length) {
    room.state="finished";
    broadcast(room);
    io.to(room.code).emit("game:finished", {ranking:ranking(room)});
    return;
  }
  startQuestion(room);
}

io.on("connection", socket => {
  socket.on("room:create", ({name}) => {
    name=cleanName(name); if(!name) return socket.emit("error:msg","Digite seu nome.");
    const c=code();
    const room={code:c,host:socket.id,state:"lobby",current:0,questions:shuffledQuestions(),players:new Map(),endsAt:0,timer:null};
    room.players.set(socket.id,{id:socket.id,name,score:0,answered:false,totalTime:0});
    rooms.set(c,room); socket.join(c);
    socket.emit("room:created",{code:c});
    broadcast(room);
  });

  socket.on("room:join", ({code,name}) => {
    code=String(code||"").trim().toUpperCase(); name=cleanName(name);
    const room=rooms.get(code);
    if(!room) return socket.emit("error:msg","Sala não encontrada.");
    if(room.state!=="lobby") return socket.emit("error:msg","Essa partida já começou.");
    if(!name) return socket.emit("error:msg","Digite seu nome.");
    if([...room.players.values()].some(p=>p.name.toLowerCase()===name.toLowerCase()))
      return socket.emit("error:msg","Esse nome já está na sala.");
    room.players.set(socket.id,{id:socket.id,name,score:0,answered:false,totalTime:0});
    socket.join(code); socket.emit("room:joined",{code}); broadcast(room);
  });

  socket.on("game:start", ({code}) => {
    const room=rooms.get(code); if(!room || room.host!==socket.id) return;
    if(room.players.size<1) return;
    startQuestion(room);
  });

  socket.on("answer", ({code,index}) => {
    const room=rooms.get(code), p=room && room.players.get(socket.id);
    if(!room || !p || room.state!=="playing" || p.answered) return;
    p.answered=true;
    const elapsed=Math.max(0,Date.now()-(room.endsAt-15000));
    const q=room.questions[room.current];
    if(Number(index)===q.c) {
      p.score += q.p;
      p.totalTime += elapsed;
    }
    io.to(room.code).emit("player:answered",{name:p.name});
    if([...room.players.values()].every(x=>x.answered)) finishQuestion(room);
    else broadcast(room);
  });

  socket.on("next", ({code}) => {
    const room=rooms.get(code); if(!room || room.host!==socket.id || room.state!=="ranking") return;
    nextQuestion(room);
  });

  socket.on("restart", ({code}) => {
    const room=rooms.get(code); if(!room || room.host!==socket.id) return;
    room.state="lobby"; room.current=0; room.questions=shuffledQuestions();
    room.players.forEach(p=>{p.score=0;p.answered=false;p.totalTime=0});
    broadcast(room);
  });

  socket.on("disconnect", () => {
    for(const [c,room] of rooms) {
      if(!room.players.has(socket.id)) continue;
      room.players.delete(socket.id);
      if(room.host===socket.id) {
        const first=room.players.values().next().value;
        if(first) room.host=first.id;
        else { clearTimeout(room.timer); rooms.delete(c); continue; }
      }
      if(room.state==="playing" && [...room.players.values()].every(p=>p.answered)) finishQuestion(room);
      broadcast(room);
    }
  });
});

server.listen(PORT,()=>console.log(`Ralph multiplayer running on port ${PORT}`));
