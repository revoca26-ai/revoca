import { logger } from '../../utils/logger.js';
// this file will handle the webhook events
import orgRepository from '../org/orgRepository.js'
import userRepository from '../user/userRepository.js'

export async function handleOrganizationCreated(event: any) {
    // extract the organization type from the event data
    const orgType = event.data.public_metadata?.org_type ?? 'team'
    const org = await orgRepository.create({
        clerk_org_id: event.data.id,
        name: event.data.name,
        org_type: orgType
    })
    logger.info(`Organization created: ${org.id}`)
}

export async function handleOrganizationMembershipCreated(event: any) {
    const clerkUserId = event.data.public_user_data.user_id
    const clerkOrgId = event.data.organization.id
    const email = event.data.public_user_data.identifier
    const role = event.data.role.replace('org:', '')  // "org:member" → "member"

    // just in case the email is not found safegaurd for our database
    if (!email) {
        logger.info(`User email not found: ${clerkUserId}`)
        return
    }

    const org = await orgRepository.findByClerkOrgId(clerkOrgId)
    if (!org) {
        logger.info(`Organization not found: ${clerkOrgId}`)
        return
    }

    const user = await userRepository.create(org.id, {
        clerk_user_id: clerkUserId,
        email: email,
        role: role,
    })
    logger.info(`User created: ${user.id} for organization: ${org.id}`)
}

export async function handleOrganizationMembershipUpdated(event: any) {
    const clerkUserId = event.data.public_user_data.user_id
    const clerkOrgId = event.data.organization.id
    const role = event.data.role.replace('org:', '')  // "org:member" → "member"

    const org = await orgRepository.findByClerkOrgId(clerkOrgId)
    if (!org) {
        logger.info(`Organization not found: ${clerkOrgId}`)
        return
    }

    const user = await userRepository.findByClerkUserId(clerkUserId)
    if (!user) {
        logger.info(`User not found: ${clerkUserId}`)
        return
    }

    const updated = await userRepository.updateById(user.id, org.id, { role })
    logger.info(`User role updated: ${updated?.id} → ${role}`)
}

export async function handleOrganizationMembershipDeleted(event: any) {
    const clerkUserId = event.data.public_user_data.user_id
    const clerkOrgId = event.data.organization.id

    const org = await orgRepository.findByClerkOrgId(clerkOrgId)
    if (!org) {
        logger.info(`Organization not found: ${clerkOrgId}`)
        return
    }

    const user = await userRepository.findByClerkUserId(clerkUserId)
    if (!user) {
        logger.info(`User not found: ${clerkUserId}`)
        return
    }

    const deleted = await userRepository.deleteById(user.id, org.id)
    logger.info(`User removed from organization: ${user.id}, success: ${deleted}`)
}