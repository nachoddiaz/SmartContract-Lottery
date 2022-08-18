const { ethers, getNamedAccounts, network } = require("hardhat")
const { assert, expect } = require("chai")
const { devChains } = require("../../helper-hardhat-config")

devChains.includes(network.name)
    ? describe.skip
    : describe("Raffle", function () {
          let raffle, precioEntrada, deployer

          beforeEach(async function () {
              deployer = (await getNamedAccounts()).deployer
              raffle = await ethers.getContract("Raffle", deployer) //Coge el último deploy de FunMe
              precioEntrada = await raffle.getPrecioentrada()
          })

          describe("fulfillRandomWords", function () {
              it("works with live Chainlink Keepers and VRFs, picks a winner, resets lottery & sends money ", async function () {
                  const accounts = await ethers.getSigners()
                  const startingTimeStamp = await raffle.getLastTimeStamp()

                  await new Promise(async (resolve, reject) => {
                      raffle.once("WinnerPicked", async () => {
                          console.log("Evento encontrado!!")
                          try {
                              const recentwinner = await raffle.getWinner()
                              const raffleState = await raffle.getRaffleState()
                              const winnerEndingBalance = await accounts[0].getBalance()
                              const endingTimeStamp = await raffle.getLastTimeStamp()
                              
                              await expect(raffle.getPlayer(0)).to.be.reverted
                              assert.equal(raffleState, 0)
                              assert.equal(recentwinner.toString(), accounts[0].address)
                              assert.equal(
                                  winnerEndingBalance.toString(),
                                  winnerStartingBalance.add(precioEntrada).toString()
                              )
                              assert(endingTimeStamp > startingTimeStamp)
                              resolve()
                          } catch (error) {
                              console.log(error)
                              reject(error)
                          }
                      })
                      console.log("Entrando a la Rifa")
                      const tx = await raffle.enterRaffle({ value: precioEntrada })
                      await tx.wait(1)
                      console.log("Ok, time to wait...")
                      const winnerStartingBalance = await accounts[0].getBalance()
                  })
              })
          })
      })
