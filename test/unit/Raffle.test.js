const { ethers, deployments, getNamedAccounts, network } = require("hardhat")
const { assert, expect } = require("chai")
const { devChains, networkConfig } = require("../../helper-hardhat-config")



!devChains.includes(network.name)
    ? describe.skip
    : describe("Raffle", function () {
          let raffle, vrfCoordinatorV2Mock, precioEntrada, interval
          const chainId = network.config.chainId
          const sendValue = ethers.utils.parseEther("1")

          beforeEach(async function () {
              deployer = (await getNamedAccounts()).deployer
              await deployments.fixture(["all"]) //Con esta linea se deplega todo el contrato
              raffle = await ethers.getContract("Raffle", deployer) //Coge el último deploy de FunMe
              vrfCoordinatorV2Mock = await ethers.getContract("VRFCoordinatorV2Mock", deployer)
              precioEntrada = await raffle.getPrecioentrada()
              interval = await raffle.getInterval()
          })

          describe("constructor", function () {
              it("initializes de raffle correctly", async function () {
                  const raffleState = await raffle.getRaffleState()
                  assert.equal(raffleState.toString(), "0")
                  /* const interval = await raffle.getInterval()
                  assert.equal(interval.toString(), networkConfig[chainId]["interval"]) */
                  const precioEntrada = await raffle.getPrecioentrada()
                  assert.equal(precioEntrada.toString(), networkConfig[chainId]["precioEntrada"])
                  const KeyHash = await raffle.getKeyHash()
                  assert.equal(KeyHash.toString(), networkConfig[chainId]["keyHash"])
              })
          })
          describe("enterRaffle", function () {
              it("Have not send enough money to enter the raffle", async function () {
                  await expect(raffle.enterRaffle()).to.be.revertedWith("Raffle__NotEnoughEther")
              })
              it("Records player when they enter", async function () {
                  await raffle.enterRaffle({ value: precioEntrada })
                  const player = await raffle.getPlayer(0)
                  assert.equal(player, deployer)
              })
              it("Emit event on enter", async function () {
                  await expect(raffle.enterRaffle({ value: precioEntrada })).to.emit(
                      raffle,
                      "RaffleEnter"
                  )
              })
              it("Doesnt allow to enter when the raffle is calculating", async function () {
                  await raffle.enterRaffle({ value: precioEntrada })
                  await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
                  await network.provider.send("evm_mine", [])

                  //Buscamos simular el Chainlink Keeper
                  await raffle.performUpkeep([]) //Pasamos [] vacíos pq no necesita ningún parámetro
                  await expect(raffle.enterRaffle({ value: precioEntrada })).to.be.revertedWith(
                      "Raffle__NotOpen"
                  )
              })
          })
          describe("checkUpkeep", function () {
              it("returns false if people havent sent any eth", async function () {
                  await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
                  await network.provider.send("evm_mine", [])
                  //upkeepNeeded = (timePassed && isOpen && hasBalance && hasPlayers)
                  //Ponemos callStatic para simular la transaccion
                  const { upkeepNeeded } = await raffle.callStatic.checkUpkeep("0x")
                  assert(!upkeepNeeded)
              })
              it("returns false if the raffle is closed", async function () {
                  await raffle.enterRaffle({ value: precioEntrada })
                  await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
                  await network.provider.send("evm_mine", [])
                  await raffle.performUpkeep([]) //([]) == ("0x")
                  const raffleState = await raffle.getRaffleState()
                  const { upkeepNeeded } = await raffle.callStatic.checkUpkeep("0x")
                  assert.equal(raffleState.toString(), "1") //1 indica que está calculando
                  assert.equal(upkeepNeeded, false) //Pq open es false y upkeepNeeded = (timePassed && open && hasBalance && hasPlayers)
              })
              it("returns false if not enough time has passed", async function () {
                  await network.provider.send("evm_mine", [])
                  await raffle.enterRaffle({ value: precioEntrada })
                  await network.provider.send("evm_increaseTime", [interval.toNumber() - 1])
                  const { upkeepNeeded } = await raffle.callStatic.checkUpkeep("0x")
                  assert(!upkeepNeeded)
              })
              it("returns true if time has passed, there are players, eth & the contract is open", async function () {
                  await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
                  await network.provider.send("evm_mine", [])
                  await raffle.enterRaffle({ value: precioEntrada })
                  const { upkeepNeeded } = await raffle.callStatic.checkUpkeep("0x")
                  assert(upkeepNeeded)
              })
          })
          describe("performUpkeep", function () {
              it("runs only if checkUpkeep is true", async function () {
                  await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
                  await network.provider.send("evm_mine", [])
                  await raffle.enterRaffle({ value: precioEntrada })
                  const tx = await raffle.performUpkeep([])
                  assert(tx)
              })
              /* it("reverts with false if upkeepNeeded is false", async function () {
                  await expect(raffle.performUpkeep([])).to.be.revertedWith(
                      "Raffle_upkeepNotNeeded"
                  )
              }) */
              it("updates the raffle state, emits the event & calls the VRF Coordinator", async function () {
                  await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
                  await network.provider.send("evm_mine", [])
                  await raffle.enterRaffle({ value: precioEntrada })
                  const TXResponse = await raffle.performUpkeep([])
                  const TXReceipt = await TXResponse.wait(1)
                  const requestId = TXReceipt.events[1].args.requestId
                  const raffleState = await raffle.getRaffleState()
                  assert(requestId.toNumber() > 0)
                  assert(raffleState.toString() == 1)
              })
          })
          describe("fulfillRandomWords", function () {
              beforeEach(async function () {
                  //Necesitamos minimo un participante en la rifa
                  await raffle.enterRaffle({ value: precioEntrada })
                  await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
                  await network.provider.send("evm_mine", [])
              })
              it("this function can only be called after performUpkeep", async function () {
                  await expect(
                      vrfCoordinatorV2Mock.fulfillRandomWords(0, raffle.address)
                  ).to.be.revertedWith("nonexistent request")
                  await expect(
                      vrfCoordinatorV2Mock.fulfillRandomWords(1, raffle.address)
                  ).to.be.revertedWith("nonexistent request")
              })
              it("pick winner, resets lottery & sends money ", async function () {
                  const additionalEntrants = 3
                  const startingAccountIndex = 1
                  const accounts = await ethers.getSigners()
                  for (
                      let i = startingAccountIndex;
                      i < startingAccountIndex + additionalEntrants;
                      i++
                  ) {
                      const accountConnectedRaffle = raffle.connect(accounts[i])
                      await accountConnectedRaffle.enterRaffle({ value: precioEntrada })
                  }
                  const startingTimeStamp = await raffle.getLastTimeStamp()

                  await new Promise(async (resolve, reject) => {
                      raffle.once("WinnerPicked", async () => {
                          console.log("Evento encontrado!!")
                          try {
                              const recentwinner = await raffle.getWinner()
                              console.log(recentwinner)
                              console.log(accounts[0].address)
                              console.log(accounts[1].address)
                              console.log(accounts[2].address)
                              console.log(accounts[3].address)
                              const raffleState = await raffle.getRaffleState()
                              const numPlayers = await raffle.getNumPlayers()
                              const endingTimeStamp = await raffle.getLastTimeStamp()
                              assert.equal(numPlayers.toString(), "0")
                              assert.equal(raffleState.toString(), "0")
                              assert(endingTimeStamp > startingTimeStamp)

                              const winnerEndingBalance = await accounts[1].getBalance()

                              assert(
                                  winnerEndingBalance.toString(),
                                  winnerStartingBalance.add(
                                      precioEntrada.mul(numPlayers).add(precioEntrada).toString()
                                  )
                              )
                          } catch (e) {
                              reject(e)
                          }
                          resolve()
                      })
                      const tx = await raffle.performUpkeep([])
                      const TXReceipt = await tx.wait(1)
                      const winnerStartingBalance = await accounts[1].getBalance()
                      await vrfCoordinatorV2Mock.fulfillRandomWords(
                          TXReceipt.events[1].args.requestId,
                          raffle.address
                      )
                  })
              })
          })
      })
