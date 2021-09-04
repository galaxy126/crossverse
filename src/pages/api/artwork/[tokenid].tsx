import type { NextApiRequest, NextApiResponse } from 'next'
import { getSession } from 'next-auth/client'
import {
    NullAddress,
    getArt,
    sign,
    setMyWallet,
    toHex,
    checktxs,
    updateTx,
    setArtLiked,
    updateOffer,
    getListings,
    addlist,
    delist,
    getOffersByTokenId,
    getOfferById,
    getNftById,
    validateAddress,
    setlog,
} from '@/utils/datamodel'
import { now } from '@/utils/helper'

export default async ( req: NextApiRequest, res: NextApiResponse<ApiResponse> ): Promise<any> => {
    try {
        const tokenid = Number(req.query.tokenid)
        const { action } = req.body
        const v = await getArt(tokenid)
        const session: any = await getSession({ req })
        if (session && session.user) {
            const { id } = session.user
            const { wallets } = global
            if (v) {
                const timestamp = now()
                if (action === 'buy') {
                    const { buyer, pid, count, buyPrice } = req.body
                    const quantity = count
                    let priceETH = 0
                    let seller = NullAddress
                    if (pid === 0) {
                        priceETH = v.price
                        if (count > v.instock) {
                            return res.json({ status: 'err', msg: 'out of balance'})
                        }
                    } else {
                        const row = await getNftById(pid)
                        priceETH = row?.sellPrice || v.price
                        seller = row?.ownerAddress || NullAddress
                        if (count > (row?.balance || 0)) {
                            return res.json({ status: 'err', msg: 'out of balance' })
                        }
                    }
                    if (priceETH!==buyPrice) {
                        return res.json({ status: 'err', msg: 'refresh page, please' })
                    }
                    const amount = toHex(priceETH * count * 1e18)
                    const price = toHex(priceETH * 1e18)
                    const pidHex = toHex(pid)
                    const msg = await setMyWallet(id, buyer)
                    if (msg===null) {
                        const signature = await sign( buyer, seller, tokenid, price, quantity, amount, timestamp )
                        if (signature) {
                            return res.json({ status: 'ok', msg: [ pidHex, tokenid, price, quantity, amount, timestamp, seller, signature ] })
                        } else {
                            return res.json({ status: 'err', msg: 'bad signature' })
                        }
                    } else {
                        return res.json({ status: 'err', msg })
                    }
                    
                } else if (action === 'sell') {
                    const { seller, pid, count, sellPrice } = req.body
                    const offer = await getOfferById(pid)
                    if (offer !== null) {
                        const price = toHex(offer.price * 1e18)
                        const quantity = toHex(count)
                        const amount = toHex(offer.price * count * 1e18)
                        const buyer = offer.buyer
                        if (count > offer.quantity) {
                            return res.json({ status: 'err', msg: 'out of balance' })
                        }
                        if (offer.price!==sellPrice) {
                            return res.json({ status: 'err', msg: 'refresh page, please' })
                        }
                        const msg = await setMyWallet(id, seller)
                        if (msg===null) {
                            const signature = await sign( buyer, seller, tokenid, price, quantity, amount, timestamp )
                            if (signature) {
                                return res.json({ status: 'ok', msg: [ pid, tokenid, price, quantity, amount, timestamp, buyer, signature ] })
                            } else {
                                return res.json({ status: 'err', msg: 'bad signature' })
                            }
                        } else {
                            return res.json({ status: 'err', msg })
                        }
                    }
                } else if (action === 'transfer') {
                    const { address, to, count } = req.body
                    const valid = validateAddress(to)
                    if (valid) {
                        const uid = wallets[to] || wallets[to.toLowerCase()]
                        if (uid) {
                            await setMyWallet(id, address)
                            return res.json({ status: 'ok', msg: [to, tokenid, count, '0x0'] })
                        } else {
                            return res.json({ status: 'err', msg: 'unregistered account' })
                        }
                    } else {
                        return res.json({ status: 'err', msg: 'invalid address format' })
                    }
                } else if (action === 'tx') {
                    const { tx } = req.body
                    await updateTx(id, tx)
                    return res.json({ status: 'ok' })
                } else if (action === 'offer') {
                    const { tx, offer } = req.body
                    await updateTx(id, tx)
                    await updateOffer(id, { ...offer, txid: tx.txid, buyer: tx.from, status: 0, created: now(), })
                    return res.json({ status: 'ok' })
                } else if (action === 'check') {
                    await checktxs()
                    return res.json({ status: 'ok' })
                } else if (action === 'like') {
                    const result = await setArtLiked(id, tokenid)
                    if (result) {
                        return res.json({ status: 'ok' })
                    } else {
                        return res.json({ status: 'err', msg: 'You already add to favorites', })
                    }
                } else if (action === 'list') {
                    const { tx, list } = req.body
                    await addlist( tokenid, id, list.address, list.price, list.quantity )
                    await updateTx(id, tx)
                    return res.json({ status: 'ok' })
                } else if (action === 'delist') {
                    await delist(id)
                    return res.json({ status: 'ok' })
                } else if (action === 'listing') {
                    return res.json({ status: 'ok', msg: await getListings(tokenid, id) })
                } else if (action === 'offers') {
                    return res.json({ status: 'ok', msg: await getOffersByTokenId(tokenid, id) })
                }
            }
        } else {
            res.json({ status: 'err', msg: 'login' })
        }
    } catch (err:any) {
        setlog(err)
    }
    res.json({ status: 'err', msg: 'unknown' })
}