import React, { useState } from "react";
// importame el abi
import abi from '../abi/abi.json'
import {
  createWalletClient,
  createPublicClient,
  custom,
  http
} from "viem";
import { sepolia } from "viem/chains";

// Define tu ABI y dirección de contrato
const contractAddress = "0x0864B645Bdc3501326ea698F34CA9BF88d58B3f9";
const contractAbi = abi;

// Inicializa los clientes de viem
const publicClient = createPublicClient({
  chain: sepolia,
  transport: http(),
});
const walletClient = createWalletClient({
  chain: sepolia,
  transport: custom(window.ethereum),
});

function App() {
  const [account, setAccount] = useState();
  const [toAddress, setToAddress] = useState("");
  const [uri, setUri] = useState("");
  const [status, setStatus] = useState("");
  const [tokenId, setTokenId] = useState("");
  const [info, setInfo] = useState(null);
  const [isPaused, setIsPaused] = useState(null);

  // Conectar wallet y obtener address con viem
  const connectWallet = async () => {
    const [address] = await walletClient.requestAddresses();
    setAccount(address);
    setStatus("Wallet conectada: " + address);
    // Verificar estado de pausa al conectar
    checkPausedState();
  };

  // Verificar si el contrato está pausado
  const checkPausedState = async () => {
    try {
      const paused = await publicClient.readContract({
        address: contractAddress,
        abi: contractAbi,
        functionName: "paused",
      });
      setIsPaused(paused);
    } catch (err) {
      console.error("Error verificando estado de pausa:", err);
    }
  };

  // Despaúsar el contrato (solo el owner puede hacerlo)
  const unpauseContract = async () => {
    if (!account) {
      setStatus("Conecta la wallet primero");
      return;
    }
    try {
      setStatus("Despausando contrato...");
      const { request } = await publicClient.simulateContract({
        address: contractAddress,
        abi: contractAbi,
        functionName: "unpause",
        account,
      });
      const hash = await walletClient.writeContract(request);
      setStatus("Despausado enviado, hash: " + hash);
      // Verificar estado después de unos segundos
      setTimeout(checkPausedState, 3000);
    } catch (err) {
      setStatus("Error despausando: " + (err.shortMessage || err.message));
    }
  };

  // Helper para estimar el gas del mint
const estimateGasForMint = async ({ account, toAddress, uri, contractAddress, contractAbi, publicClient }) => {
  return await publicClient.estimateGas({
    address: contractAddress,
    abi: contractAbi,
    functionName: "mintProperty",
    args: [toAddress, uri],
    account,
  });
};

// Helper para extraer tokenId del evento Transfer en el receipt
const getMintedTokenIdFromTx = async ({ hash, contractAddress, publicClient }) => {
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  const TRANSFER_EVENT_TOPIC =
    "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
  const transferLog = receipt.logs.find(
    (log) =>
      log.address.toLowerCase() === contractAddress.toLowerCase() &&
      log.topics[0] === TRANSFER_EVENT_TOPIC
  );
  if (!transferLog) return null;
  return BigInt(transferLog.topics[3]).toString();
};

const mint = async () => {
  if (!account) {
    setStatus("Conecta la wallet primero");
    return;
  }
  try {
    setStatus("Estimando gas...");
    const gasEstimate = await estimateGasForMint({
      account,
      toAddress,
      uri,
      contractAddress,
      contractAbi,
      publicClient,
    });

    setStatus(`Gas estimado: ${gasEstimate.toString()} units. Ejecutando mint...`);

    // Ajusta gas (10% extra)
    const gasLimit = gasEstimate + 100000n;

    const { request } = await publicClient.simulateContract({
      address: contractAddress,
      abi: contractAbi,
      functionName: "mintProperty",
      args: [toAddress, uri],
      account,
      gas: gasLimit,
    });

    const hash = await walletClient.writeContract(request);

    setStatus("Mint enviado, esperando confirmación...");

    // Helper reutilizable para obtener el tokenId
    const tokenIdMinted = await getMintedTokenIdFromTx({
      hash,
      contractAddress,
      publicClient,
    });
    console.log('tokenIdMint', tokenIdMinted);
    
    if (tokenIdMinted) {
      setStatus(
        `✅ Mint exitoso!\nTx hash: ${hash}\nTokenId creado: ${tokenIdMinted}\nGas usado: ${gasLimit.toString()}`
      );
      setTokenId(tokenIdMinted);
    } else {
      setStatus(
        `Mint enviado (hash: ${hash}), pero no se pudo encontrar el tokenId en los logs`
      );
    }
  } catch (err) {
    setStatus("Error: " + (err.shortMessage || err.message));
  }
};



  // Consulta por tokenId
  const consultar = async () => {
    try {
      setStatus("Consultando...");
      const data = await publicClient.readContract({
        address: contractAddress,
        abi: contractAbi,
        functionName: "getPropertyInfo",
        args: [BigInt(tokenId)],
      });
      console.warn("Consulta exitosa:", data);
      console.warn("Consulta exitosajson:", JSON.stringify(data));
      setInfo(data);
      setStatus("Consulta lista.");
    } catch (err) {
      console.error(err)
      setInfo(null);
      setStatus("Error: " + (err.shortMessage || err.message));
    }
  };

  // Helper para mostrar estado
  const getStateString = (state) => {
    switch (state) {
      case 0: return "IN_NOTARY";
      case 1: return "VALIDATED";
      case 2: return "REGISTERED";
      default: return "UNKNOWN";
    }
  };

  return (
    <div style={{ padding: 24, fontFamily: "sans-serif" }}>
      <h2>Registro de Propiedad con viem (Sepolia)</h2>
      <button onClick={connectWallet}>Conectar Wallet</button>
      <p><b>Cuenta conectada:</b> {account}</p>
      <p style={{ color: "#888" }}>{status}</p>
      
      {/* Estado del contrato */}
      {isPaused !== null && (
        <div style={{ 
          padding: 12, 
          marginBottom: 16, 
          backgroundColor: isPaused ? "#ffebee" : "#e8f5e8",
          border: `1px solid ${isPaused ? "#f44336" : "#4caf50"}`,
          borderRadius: 4
        }}>
          <b>Estado del contrato:</b> {isPaused ? "PAUSADO ⏸️" : "ACTIVO ✅"}
          {isPaused && (
            <div style={{ marginTop: 8 }}>
              <button 
                onClick={unpauseContract} 
                style={{ 
                  backgroundColor: "#4caf50", 
                  color: "white", 
                  border: "none", 
                  padding: "8px 16px", 
                  borderRadius: 4,
                  cursor: "pointer"
                }}
              >
                Despaúsar Contrato
              </button>
              <p style={{ fontSize: 12, color: "#666", margin: "4px 0 0 0" }}>
                Solo el owner puede despaúsar el contrato
              </p>
            </div>
          )}
        </div>
      )}
      
      <hr />
      <h3>Mintear nueva propiedad</h3>
      <input
        type="text"
        placeholder="Dirección destino (to)"
        value={toAddress}
        onChange={(e) => setToAddress(e.target.value)}
        style={{ width: 420 }}
      />
      <br />
      <input
        type="text"
        placeholder="URI/IPFS o descripción"
        value={uri}
        onChange={(e) => setUri(e.target.value)}
        style={{ width: 420, marginTop: 8 }}
      />
      <br />
      <button onClick={mint} style={{ marginTop: 12 }}>
        Mint Property
      </button>
      <hr />
      <h3>Consultar Propiedad</h3>
      <input
        type="number"
        placeholder="TokenId"
        value={tokenId}
        onChange={(e) => setTokenId(e.target.value)}
        style={{ width: 180 }}
      />
      <button onClick={consultar} style={{ marginLeft: 8 }}>
        Consultar
      </button>
      {info && (
        <div style={{ marginTop: 16 }}>
          <b>Propietario:</b> {info[0]} <br />
          <b>Estado:</b> {getStateString(Number(info[1]))} <br />
          <b>URI:</b> {info[2]}
        </div>
      )}
    </div>
  );
}

export default App;
