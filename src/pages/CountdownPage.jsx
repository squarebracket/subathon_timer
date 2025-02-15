import React, { useState, useEffect, useRef } from "react";
import { withRouter, useLocation, useHistory } from "react-router-dom";
import io from "socket.io-client"
import { Chat, ChatEvents } from 'twitch-js'
import Countdown, {zeroPad} from 'react-countdown'

function CountdownPage(props) {
  const location = useLocation();
  const history = useHistory();
  let defaultAdditionalTime;
  if (localStorage.totalTimeSeconds) {
    defaultAdditionalTime = localStorage.totalTimeSeconds
  } else {
    defaultAdditionalTime = location.state.timeSeconds
  }
  const [totalAdd, setTotalAdd] = useState(0);
  const [targetDate, setTargetDate] = useState(Date.now() + defaultAdditionalTime * 1000 );
  const [socket, setSocket] = useState();
  const [startTime, setStartTime] = useState(targetDate);
  const [lastSocketMessage, setLastSocketMessage] = useState(null);
  const color = location.state.Color;
  const countdownRef = useRef(null);

  // implement queue to synchronously do async tasks
  const [queue, setQueue] = useState({isProcessing: false, tasks: []})

  useEffect(() => {
    // //console.log(queue.tasks);
    // //console.log("IM IN THE QUEUE");
    if (queue.tasks.length === 0) return
    if (queue.isProcessing) return

    const task = queue.tasks[0]
    setQueue((prev) => ({
      isProcessing: true,
      tasks: prev.tasks.slice(1),
    }))

    Promise.resolve(task)
    .then((val) => {
      //console.log("before:", targetDate);
      //console.log("time to add:", val);
      setTargetDate(targetDate + val*1000);
      setTotalAdd(totalAdd + val);
    })
    .finally(() => {
      setQueue((prev) => ({
        isProcessing: false,
        tasks: prev.tasks,
      }))
    })
  }, [queue, queue.tasks, queue.isProcessing])

  
  const username = "justinfan20394";
  const token = "";
  const channel = location.state.ChannelName.toString().toLowerCase();
  
  const [lastSub, setLastSub] = useState("");
  const [lastResub, setLastResub] = useState("");
  const [lastCheer, setLastCheer] = useState("");
  const [lastSubGiftCommunity, setLastSubGiftCommunity] = useState("");

  const twitchChat = new Chat({
    username,
    token,
    log: { level: "warn" }
  });

  const runTwitchChat = async () => {
    twitchChat.on('DISCONNECTED', () => {
      document.location = document.location;
    });
    twitchChat.on('RECONNECT', () => {
      document.location = document.location;
    });
    twitchChat.on('ERROR_ENCOUNTERED', () => {
      document.location = document.location;
    });
    twitchChat.on("SUBSCRIPTION", (message) => {
      if (message != lastSub) {
        const subPlan = message.parameters.subPlan || "";
        const userName = message.username || "";
        //console.log(`ADD: SUBSCRIPTION ${userName}`, subPlan);
        setLastSub(message);
        handleSubs(subPlan, 1);
      }
    });
    twitchChat.on("RESUBSCRIPTION", (message) => {
      if (message != lastResub) {
        const msg = message.message || "";
        const subPlan = message.parameters.subPlan || "";
        const userName = message.username || "";
        //console.log(`ADD: RESUBSCRIPTION ${userName} ${msg}`, subPlan);
        setLastResub(message);
        handleSubs(subPlan, 1);
      }
    });
    twitchChat.on("CHEER", (message) => {
      if (message != lastCheer) {
        const userName = message.username || "";
        const bits = message.bits || 0;
        //console.log(`ADD: CHEER ${userName} ${bits} bits`);
        setLastCheer(message);
        handleBits(bits);
      }
    });
    twitchChat.on("SUBSCRIPTION_GIFT_COMMUNITY", (message) => {
      if (message != lastSubGiftCommunity) {
        const msg = message.systemMessage || "";
        const numGifts = message.parameters.massGiftCount
        const subPlan = message.parameters.subPlan || ""
        //console.log("ADD: SUBSCRIPTION_GIFT_COMMUNITY",numGifts, subPlan, msg);
        setLastSubGiftCommunity(message);
        handleSubs(subPlan, numGifts);
      }
    });
    twitchChat.on('PRIVMSG', (message) => {
      // console.log(`${message.tags.badges.moderator} -> ${message.username}: ${message.message}`);
      if (message.tags.badges.moderator || message.tags.badges.broadcaster) {
        const messageTokens = message.message.split(' ');
        if (messageTokens[0] === '!addtime') {
          const timeToAdd = parseInt(messageTokens[1]);
          setQueue(
            (prev) => ({
              isProcessing: prev.isProcessing,
              tasks: prev.tasks.concat([timeToAdd]),
            })
          )
        } else if (messageTokens[0] === '!pause') {
          countdownRef.current.pause();
        } else if (messageTokens[0] === '!resume') {
          countdownRef.current.start();
        }
      }
    })
  
    await twitchChat.connect();
    await twitchChat.join(channel);
  };


  let socketStreamlabs;
  let socketStreamElements;

  const runSocketStreamlabs = async () => {
    socketStreamlabs = io(`https://sockets.streamlabs.com?token=${location.state.Token}`, {transports: ["websocket"],});
    socketStreamlabs.on("connect", () => {
      //console.log("connected with streamlabs");
      //console.log(socketStreamlabs.connected); // true
    });

    socketStreamlabs.on("event", (eventData) => {
      if (eventData.type === "donation") {
        //code to handle donation events
        var donoTime = Math.floor(eventData.message[0].amount) * location.state.donationsTime;
        //console.log("Dono streamlabs received: $", eventData.message[0].amount, "time to add:", donoTime);
        setQueue(
          (prev) => ({
            isProcessing: prev.isProcessing,
            tasks: prev.tasks.concat([donoTime]),
          })
        )
      }
    });
  }
  
  const runSocketStreamelements = async () => {
    socketStreamElements = io(`https://realtime.streamelements.com`, { transports: ["websocket"] });
    //streamelements
    socketStreamElements.on("connect", () => {
      //console.log("Successfully connected to streamelements websocket");
      socketStreamElements.emit("authenticate", {
        method: "jwt",
        token: `${location.state.Token}`,
      });
    });

    socketStreamElements.on("disconnect", () => {
      //console.log("disconnected from streamelements websocket");
    });

    socketStreamElements.on("authenticated", (data) => {
      const { channelId } = data;
      //console.log(`Successfully connected to channel ${channelId}`);
    });

    socketStreamElements.on("event", (data) => {
      if (lastSocketMessage != data) {
        setLastSocketMessage(data)
        handleStreamElementsEvents(data);
      }
    });

    socketStreamElements.on("event:test", (data) => {
      handleStreamElementsEvents(data);
    });
  };
  

  useEffect(() => {
    //console.log("channelconnected:", channel);
    //console.log("initial target date check:", targetDate);
    runTwitchChat();
    // setupSocket();
    if (location.state.Api == "1" && location.state.Token != "") {
      runSocketStreamlabs();
    } else if (location.state.Api == "2" && location.state.Token != "") {
      runSocketStreamelements();
    }
  },[])

  const handleBits = (bits) => {
    if (bits > 0) {
      // setTargetDate(targetDate + location.state.bitsTime );
      setQueue(
        (prev) => ({
          isProcessing: prev.isProcessing,
          tasks: prev.tasks.concat([location.state.bitsTime * Math.floor(bits/location.state.bitsAmount) ]),
        })
      )
      //console.log("check bits successfully added:", bits, "seconds added:", Math.floor(bits/500));
    } else {
      //console.log("bits ERROR", bits);
    }
  }

  const handleSubs = (subType, subAmount) => {
    let addAmount = subAmount;
    switch (subType) {
      case "Prime":
      case "1000":
        // targetDate += subAmount * location.state.T1 ;
        addAmount *= location.state.T1;
        break;
      case "2000":
        // targetDate += subAmount * location.state.T2 ;
        addAmount *= location.state.T2;
        break;
      case "3000":
        // targetDate += subAmount * location.state.T3 ;
        addAmount *= location.state.T3;
        break;
      default:
        //console.log("error add", subType, subAmount);
        break;
      }
    if (addAmount >= 1) {
      // queue.tasks.concat(addAmount );
      setQueue(
        (prev) => ({
          isProcessing: prev.isProcessing,
          tasks: prev.tasks.concat([addAmount ]),
        })
      )
      // setTargetDate(targetDate + addAmount )
    }
    //console.log("check subs successfully added", subType, subAmount);
  }
  
  const handleStreamElementsEvents = (data) => {
    if (data.listener == "follower-latest") {
      clearInterval(intervalId);
      setQueue(
        (prev) => ({
          isProcessing: prev.isProcessing,
          tasks: prev.tasks.concat([location.state.FollowTime]),
        })
      )
    } else if (data.listener == "tip-latest" || data.type === 'tip') {
      let amount = data.data.amount;
      //console.log("Dono streamelements received: $", amount);
      setQueue(
        (prev) => ({
          isProcessing: prev.isProcessing,
          tasks: prev.tasks.concat([Math.floor(amount)*location.state.donationsTime]),
        })
      )
    }
  };

  const Completionist = () => <span style={{color: `${location.state.Color}`,fontSize: `${location.state.FontSize}px`,}}>GG GO NEXT</span>;
  
  // Renderer callback with condition
  const renderer = ({ days, hours, minutes, seconds, completed }) => {
    if (completed) {
      // Render a completed state
      return <Completionist />;
    } else {
      // Render a countdown
      //console.log("current target check: ",targetDate, "total add:", totalAdd)
      if (startTime + totalAdd*1000 != targetDate) {
        //console.log("ERROR: ", startTime + totalAdd, targetDate, "DO NOT MATCH")
      }
      // //console.log(hours + days*24, minutes, seconds);
      localStorage.setItem('totalTimeSeconds', ((days * 24 + hours) * 60 + minutes) * 60 + seconds);
      return <span>{zeroPad(hours + days*24)}:{zeroPad(minutes)}:{zeroPad(seconds)}</span>;
    }
  };

  const handleClick=()=> {
    //console.log("button pressed");
    //console.log(queue);
    setQueue(
      (prev) => ({
        isProcessing: prev.isProcessing,
        tasks: prev.tasks.concat([60]),
      })
    )
    //console.log(queue);
  }

  const handleClickBack = () => {
    //console.log(totalAdd);
    disconnectAllServices();
    history.goBack();
  }

  const onComplete = () => {
    disconnectAllServices();
  }

  const disconnectAllServices = () => {
    twitchChat.disconnect();
    //console.log("chat disconneted from:", channel);
    if (socketStreamElements.connected) {
      //console.log("streamelements socket disconneted");
      socketStreamElements.disconnect();
    }
    if (socketStreamlabs.connected) {
      //console.log("streamelements socket disconneted");
      socketStreamlabs.disconnect();
    }
  }

  return (
    <div>
      <span
          id="countdown"
          onClick={handleClickBack}
          style={{
            color: `rgba(${color.r}, ${color.g}, ${color.b}, ${color.a})`,
            fontFamily: `${location.state.FontType}`,
            fontSize: `${location.state.FontSize}px`,
          }}
        >
          <Countdown
            autoStart = {true}
            date = {targetDate}
            renderer = {renderer}
            onComplete = {onComplete}
            ref = {countdownRef}
          />
      </span>
      {/* <button
          className="bg-sky-500 hover:bg-sky-600 focus:outline-none focus:ring focus:ring-sky-400 active:bg-sky-700 px-4 py-2 text-xm leading-5 rounded-md font-semibold text-white"
          style={{ display: "block" }}
          onClick={handleClick}
        ></button> */}
    </div>
  );
}

export default withRouter(CountdownPage);
