import { getAddress } from '@ethersproject/address'
import { APIGatewayProxyHandler } from 'aws-lambda'
import BigNumber from 'bignumber.js'

import { computeBidsAsks } from '../utils/computeBidsAsks'
import { createSuccessResponse, createServerErrorResponse, createBadRequestResponse } from '../utils/response'
import { getTopPairs, getReserves, getChangeInPercentage } from './_shared'

interface ReturnShape {
  [tokenIds: string]: {
    trading_pairs: string,
    last_price: string,
    lowest_ask: string,
    highest_bid: string,
    base_volume: string,
    quote_volume: string,
    price_change_percent_24h: string
  }
}

export const handler: APIGatewayProxyHandler = async () => {
  try {
    /**
     * We get only 100 pairs because of limit of data
     */
    const pairs = await getTopPairs(100)
    const promiseArray = []
    for (const pair of pairs) {
      const returnItem = async () => {
        const id0 = getAddress(pair.token0.id)
        const id1 = getAddress(pair.token1.id)

        // let idA: string, idB: string
        const [reservesA, reservesB] = await getReserves(id0, id1)
        const { bids, asks } = computeBidsAsks(new BigNumber(reservesA), new BigNumber(reservesB));
        
        const pairData: ReturnShape = {}
        const priceChange = (pair.price && pair.previous24hToken1Price)
          ? getChangeInPercentage(new BigNumber(pair.price), pair.previous24hToken1Price).toString()
          : '0'

        pairData[`${id0}_${id1}`] = {
          trading_pairs: `${pair.token0.symbol}_${pair.token1.symbol}`,
          last_price: pair.price ?? '0',
          lowest_ask: asks.length == 0 ? '0' : asks[0][1],
          highest_bid: bids.length == 0 ? '0' : bids[0][1],
          base_volume: pair.volumeToken0,
          quote_volume: pair.volumeToken1,
          price_change_percent_24h: priceChange.toString()
        }
        return pairData
      }
      promiseArray.push(returnItem())
    }

    const returnValues = await Promise.all(promiseArray).then((values) => {
      return values
    })
    return createSuccessResponse (
      returnValues.reduce<ReturnShape>((accum, val): any => {
        return {
          ...accum,
          ...val
        }
      }, {})
    )
  } catch (error) {
    return createServerErrorResponse(error)
  }
}
