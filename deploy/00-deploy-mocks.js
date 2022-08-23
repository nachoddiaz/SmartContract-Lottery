const { utils } = require("ethers")
const { network } = require("hardhat")
const { DECIMALS, INIT_ANSWER } = require("../helper-hardhat-config")

/* estas dos variables se las pasamos al constructor de VRFCoordinatorV2Mocks */
const BASE_FEE = ethers.utils.parseEther("0.25") //Premium in the docs, price of each request in LINK
const GAS_PRICE_LINK = 1e9

module.exports = async ({ getNamedAccounts, deployments }) => {
    const { deploy, log } = deployments
    const { deployer } = await getNamedAccounts()
    const chainId = network.config.chainId

    //No queremos desplegar el contrato en testnet o mainnet
    if (chainId == 31337) {
        //Si estamos en localhost o hardhat, desplegamos mocks
        log("local network detected -> Deploying mocks")
        await deploy("VRFCoordinatorV2Mock", {
            contract: "VRFCoordinatorV2Mock",
            from: deployer,
            log: true,
            //Para saber que argumentos pasarle al contrato lo buscamos en github o node_modules
            args: [BASE_FEE, GAS_PRICE_LINK],
        })
        log("Mocks deployed!!!!")
        log(
            "----------------------------------------------------------------------------------------------"
        )
    }
}
//introducimos la opcion de deployar "all" o solo los "mocks"
module.exports.tags = ["all", "mocks"]
