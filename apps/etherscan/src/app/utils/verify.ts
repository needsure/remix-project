import { getNetworkName, getEtherScanApi, getReceiptStatus } from "../utils"
import { CompilationResult } from "@remixproject/plugin-api"
import axios from 'axios'
import { PluginClient } from "@remixproject/plugin"

const resetAfter10Seconds = (client: PluginClient, setResults: (value: string) => void) => {
    setTimeout(() => {
      client.emit("statusChanged", { key: "none" })
      setResults("")
    }, 10000)
  }

export type EtherScanReturn = {
    guid: any,
    status: any,
}
export const verify = async (
    apiKeyParam: string,
    contractAddress: string,
    contractArgumentsParam: string,
    contractName: string,
    compilationResultParam: any,
    client: PluginClient,
    onVerifiedContract: (value: EtherScanReturn) => void,
    setResults: (value: string) => void
  ) => {
    const network = await getNetworkName(client)
    if (network === "vm") {
        return {
            succeed: false,
            message: "Cannot verify in the selected network"
        }
    }
    const etherscanApi = getEtherScanApi(network)

    try {
      const contractMetadata = getContractMetadata(
        compilationResultParam.data,
        contractName
      )

      if (!contractMetadata) {
        return {
            succeed: false,
            message: "Please recompile contract"
        }
      }
      
      const contractMetadataParsed = JSON.parse(contractMetadata)

      const fileName = getContractFileName(
        compilationResultParam.data,
        contractName
      )

      const jsonInput = {
        language: 'Solidity',
        sources: compilationResultParam.source.sources,
        settings: {
          optimizer: {
            enabled: contractMetadataParsed.settings.optimizer.enabled,
            runs: contractMetadataParsed.settings.optimizer.runs
          }
        }
      }

      const data: { [key: string]: string | any } = {
        apikey: apiKeyParam, // A valid API-Key is required
        module: "contract", // Do not change
        action: "verifysourcecode", // Do not change
        codeformat: "solidity-standard-json-input",
        contractaddress: contractAddress, // Contract Address starts with 0x...
        sourceCode: JSON.stringify(jsonInput),
        contractname: fileName + ':' + contractName,
        compilerversion: `v${contractMetadataParsed.compiler.version}`, // see http://etherscan.io/solcversions for list of support versions
        constructorArguements: contractArgumentsParam, // if applicable
      }

      const body = new FormData()
      Object.keys(data).forEach((key) => body.append(key, data[key]))

      client.emit("statusChanged", {
        key: "loading",
        type: "info",
        title: "Verifying ...",
      })
      const response = await axios.post(etherscanApi, body)
      const { message, result, status } = await response.data

      if (message === "OK" && status === "1") {
        resetAfter10Seconds(client, setResults)
        const receiptStatus = await getReceiptStatus(
          result,
          apiKeyParam,
          etherscanApi
        )

        const returnValue = {
            guid: result,
            status: receiptStatus,
            message: `Contract verified correctly. Receipt GUID ${result}`,
            succeed: true
        }
        onVerifiedContract(returnValue)
        return returnValue
      }
      if (message === "NOTOK") {
        client.emit("statusChanged", {
          key: "failed",
          type: "error",
          title: result,
        })
        const returnValue = {
            status: result,
            message: `Contract not verified`,
            succeed: false
        }
        resetAfter10Seconds(client, setResults)
        return returnValue
      }
      return result
    } catch (error) {
      console.error(error)
      setResults("Something wrong happened, try again")
    }
  }

  export const getContractFileName = (
    compilationResult: CompilationResult,
    contractName: string
  ) => {
    const compiledContracts = compilationResult.contracts
    let fileName = ""
  
    for (const file of Object.keys(compiledContracts)) {
      for (const contract of Object.keys(compiledContracts[file])) {
        if (contract === contractName) {
          fileName = file
          break
        }
      }
    }
    return fileName
  }
  
  export const getContractMetadata = (
    compilationResult: CompilationResult,
    contractName: string
  ) => {
    const compiledContracts = compilationResult.contracts
    let contractMetadata = ""
  
    for (const file of Object.keys(compiledContracts)) {
      for (const contract of Object.keys(compiledContracts[file])) {
        if (contract === contractName) {
          contractMetadata = compiledContracts[file][contract].metadata
          if (contractMetadata) {
            break
          }
        }
      }
    }
    return contractMetadata
  }