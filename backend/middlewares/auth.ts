import { getAuth } from '@clerk/express'
import { clerkClient } from '@clerk/express'
import { NextFunction, Request, Response } from 'express'
import { User } from '../types/users.js'
import userRepository from '../modules/user/userRepository.js'
import orgRepository from '../modules/org/orgRepository.js'


async function authenticateUser(req: Request, res: Response, next: NextFunction) {
    try {
        const { userId: clerkUserId, orgId: clerkOrgId } = getAuth(req)
        if (!clerkUserId) {
            return res.status(401).json({ error: 'Unauthorized' })
        }

        let user = await userRepository.findByClerkUserId(clerkUserId)
        if (!user) {
            // JIT provision user if webhook hasn't synced yet
            if (!clerkOrgId) {
                return res.status(400).json({ error: 'Unable to retrieve organization' })
            }

            let org = await orgRepository.findByClerkOrgId(clerkOrgId)
            if (!org) {
                return res.status(400).json({ error: 'Unable to retrieve organization' })
            }

            const clerkUser = await clerkClient.users.getUser(clerkUserId)
            const email = clerkUser.emailAddresses[0].emailAddress
            if (!email) {
                return res.status(400).json({ error: 'Unable to retrieve user email' })
            }

            // get the user's org role from the membership (not user metadata)
            const memberships = await clerkClient.organizations.getOrganizationMembershipList({
                organizationId: clerkOrgId,
            })
            const membership = memberships.data.find(m => m.publicUserData?.userId === clerkUserId)
            const role = membership?.role?.replace('org:', '') ?? 'member'

            user = await userRepository.create(org.id, {
                clerk_user_id: clerkUserId,
                email: email,
                role: role,
            })
        }
        // attach the user and clerk user id to the request
        req.user = user
        req.clerkUserId = clerkUserId
        next()
    } catch (error) {
        next(error)
    }
}

export default authenticateUser
