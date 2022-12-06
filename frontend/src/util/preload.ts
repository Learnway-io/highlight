import { DEFAULT_PAGE_SIZE } from '@components/Pagination/Pagination'
import {
	GetEnhancedUserDetailsDocument,
	GetErrorDistributionDocument,
	GetErrorGroupDocument,
	GetErrorGroupsOpenSearchDocument,
	GetErrorInstanceDocument,
	GetErrorsHistogramDocument,
	GetEventChunksDocument,
	GetEventChunkUrlDocument,
	GetRecentErrorsDocument,
	GetSessionCommentsDocument,
	GetSessionDocument,
	GetSessionIntervalsDocument,
	GetSessionPayloadDocument,
	GetSessionsOpenSearchDocument,
	GetTimelineIndicatorEventsDocument,
	GetWebVitalsDocument,
} from '@graph/hooks'
import { ErrorInstance, OpenSearchCalendarInterval } from '@graph/schemas'
import { indexeddbEnabled, IndexedDBLink } from '@util/db'
import { client } from '@util/graph'
import log from '@util/log'
import { useParams } from '@util/react-router/useParams'
import { H } from 'highlight.run'
import moment from 'moment'
import { useEffect, useRef } from 'react'

import { worker } from '../index'

const CONCURRENT_PRELOADS = 2
const PREVIOUS_ERROR_OBJECTS_TO_FETCH = 2

export const usePreloadSessions = function ({ page }: { page: number }) {
	const { project_id } = useParams<{
		project_id: string
	}>()
	const endDate = useRef<moment.Moment>(
		moment(moment().format('MM/DD/YYYY HH:mm')),
	)
	const preloadedPages = useRef<Set<number>>(new Set<number>())

	const pageToLoad = page ?? 1
	const query = JSON.stringify({
		bool: {
			must: [
				{
					bool: {
						should: [
							{
								term: {
									processed: 'true',
								},
							},
						],
					},
				},
				{
					bool: {
						should: [
							{
								range: {
									created_at: {
										gte: endDate.current
											.clone()
											.subtract(30, 'days')
											.format(),
										lte: endDate.current.format(),
									},
								},
							},
						],
					},
				},
			],
		},
	})

	useEffect(() => {
		;(async () => {
			if (!indexeddbEnabled || preloadedPages.current.has(pageToLoad)) {
				return false
			}
			const { data: sessions } = await client.query({
				query: GetSessionsOpenSearchDocument,
				variables: {
					query,
					count: DEFAULT_PAGE_SIZE,
					page: pageToLoad,
					project_id,
					sort_desc: true,
				},
			})
			if (!sessions?.sessions_opensearch.sessions.length) return false
			preloadedPages.current.add(pageToLoad)

			const promises: Promise<void>[] = []
			for (const _s of sessions?.sessions_opensearch.sessions || []) {
				promises.push(loadSession(_s.secure_id))
				if (promises.length === CONCURRENT_PRELOADS) {
					await Promise.all(promises)
					promises.length = 0
				}
			}
			await Promise.all(promises)
		})()
	}, [pageToLoad, project_id, query])
}

export const usePreloadErrors = function ({ page }: { page: number }) {
	const { project_id } = useParams<{
		project_id: string
	}>()
	const endDate = useRef<moment.Moment>(
		moment(moment().format('MM/DD/YYYY HH:mm')),
	)
	const preloadedPages = useRef<Set<number>>(new Set<number>())

	const pageToLoad = page ?? 1
	const query = JSON.stringify({
		bool: {
			must: [
				{
					bool: {
						must: [
							{
								bool: {
									should: [
										{
											term: {
												'state.keyword': 'OPEN',
											},
										},
									],
								},
							},
						],
					},
				},
				{
					has_child: {
						type: 'child',
						query: {
							bool: {
								must: [
									{
										bool: {
											should: [
												{
													range: {
														timestamp: {
															gte: endDate.current
																.clone()
																.subtract(
																	30,
																	'days',
																)
																.format(),
															lte: endDate.current.format(),
														},
													},
												},
											],
										},
									},
								],
							},
						},
					},
				},
			],
		},
	})

	useEffect(() => {
		;(async () => {
			if (!indexeddbEnabled || preloadedPages.current.has(pageToLoad))
				return false
			const { data: errors } = await client.query({
				query: GetErrorGroupsOpenSearchDocument,
				variables: {
					query,
					count: DEFAULT_PAGE_SIZE,
					page: pageToLoad,
					project_id,
				},
			})

			if (!errors?.error_groups_opensearch.error_groups.length)
				return false
			preloadedPages.current.add(pageToLoad)

			client.query({
				query: GetErrorsHistogramDocument,
				variables: {
					query,
					project_id,
					histogram_options: {
						bounds: {
							start_date: endDate.current
								.clone()
								.subtract(30, 'days')
								.format(),
							end_date: endDate.current.format(),
						},
						bucket_size: {
							calendar_interval: OpenSearchCalendarInterval.Day,
							multiple: 1,
						},
						time_zone: '',
					},
				},
			})
			const promises: Promise<void>[] = []
			for (const _eg of errors?.error_groups_opensearch.error_groups ||
				[]) {
				promises.push(loadErrorGroup(project_id, _eg.secure_id))
				if (promises.length === CONCURRENT_PRELOADS) {
					await Promise.all(promises)
					promises.length = 0
				}
			}
			await Promise.all(promises)
		})()
	}, [project_id, pageToLoad, query])
}

export const loadSession = async function (secureID: string) {
	if (
		await IndexedDBLink.has('GetSession', {
			secure_id: secureID,
		})
	) {
		log('preload.ts', `skipping loaded session ${secureID}`)
		return
	}
	const start = window.performance.now()
	log('preload.ts', `preloading session ${secureID}`)
	try {
		const session = await client.query({
			query: GetSessionDocument,
			variables: {
				secure_id: secureID,
			},
		})
		const sess = session?.data?.session
		if (!sess) return
		if (sess.resources_url) {
			worker.postMessage({
				type: 'fetch',
				url: sess.resources_url,
			})
		}
		if (sess.messages_url) {
			worker.postMessage({
				type: 'fetch',
				url: sess.messages_url,
			})
		}
		if (sess.direct_download_url) {
			worker.postMessage({
				type: 'fetch',
				url: sess.direct_download_url,
			})
		}
		await client.query({
			query: GetSessionIntervalsDocument,
			variables: {
				session_secure_id: secureID,
			},
		})
		await client.query({
			query: GetTimelineIndicatorEventsDocument,
			variables: {
				session_secure_id: secureID,
			},
		})
		await client.query({
			query: GetEventChunksDocument,
			variables: {
				secure_id: secureID,
			},
		})
		await client.query({
			query: GetSessionCommentsDocument,
			variables: {
				session_secure_id: secureID,
			},
		})
		await client.query({
			query: GetSessionPayloadDocument,
			variables: {
				session_secure_id: secureID,
				skip_events: true,
			},
		})
		await client.query({
			query: GetEnhancedUserDetailsDocument,
			variables: {
				session_secure_id: secureID,
			},
		})
		await client.query({
			query: GetWebVitalsDocument,
			variables: {
				session_secure_id: secureID,
			},
		})
		const response = await client.query({
			query: GetEventChunkUrlDocument,
			variables: {
				secure_id: secureID,
				index: 0,
			},
		})
		worker.postMessage({
			type: 'fetch',
			url: response.data.event_chunk_url,
		})
		const preloadTime = window.performance.now() - start
		log(
			'preload.ts',
			`preloaded session ${secureID} in ${preloadTime / 1000} s.`,
		)
		H.metrics([
			{
				name: 'preload-session-ms',
				value: preloadTime,
				tags: [
					{
						name: 'SecureID',
						value: secureID,
					},
				],
			},
		])
	} catch (e: any) {
		const msg = `failed to preload session ${secureID}`
		console.warn(msg)
		H.consumeError(e, msg)
	}
}

const loadErrorGroup = async function (projectID: string, secureID: string) {
	if (
		await IndexedDBLink.has('GetErrorGroup', {
			secure_id: secureID,
		})
	) {
		log('preload.ts', `skipping loaded error group ${secureID}`)
		return
	}
	const start = window.performance.now()
	log('preload.ts', `preloading error group ${secureID}`)
	try {
		await client.query({
			query: GetErrorGroupDocument,
			variables: {
				secure_id: secureID,
			},
		})
		// run this query with the `error_object_id` variable set to 0 as well, as the ui uses both
		await client.query({
			query: GetErrorInstanceDocument,
			variables: {
				error_group_secure_id: secureID,
				error_object_id: '0',
			},
		})
		let errorObjectID = '0'
		for (let i = 0; i < PREVIOUS_ERROR_OBJECTS_TO_FETCH; i++) {
			const errorInstance = (
				await client.query({
					query: GetErrorInstanceDocument,
					variables:
						errorObjectID === '0'
							? { error_group_secure_id: secureID }
							: {
									error_group_secure_id: secureID,
									error_object_id: errorObjectID,
							  },
				})
			)?.data?.error_instance as ErrorInstance
			const sessionSecureID =
				errorInstance.error_object.session?.secure_id
			if (sessionSecureID) {
				log('preload.ts', 'loading session from error object', {
					errorGroupSecureID: secureID,
					errorInstance,
					sessionSecureID,
				})
				await loadSession(sessionSecureID)
			}
			if (
				errorInstance?.previous_id?.length &&
				errorInstance.previous_id !== '0'
			) {
				errorObjectID = errorInstance?.previous_id
			} else {
				break
			}
		}
		await client.query({
			query: GetRecentErrorsDocument,
			variables: {
				secure_id: secureID,
			},
		})
		await client.query({
			query: GetErrorDistributionDocument,
			variables: {
				error_group_secure_id: secureID,
				project_id: projectID,
				property: 'os',
			},
		})
		await client.query({
			query: GetErrorDistributionDocument,
			variables: {
				error_group_secure_id: secureID,
				project_id: projectID,
				property: 'browser',
			},
		})
		const preloadTime = window.performance.now() - start
		log(
			'preload.ts',
			`preloaded error group ${secureID} in ${preloadTime / 1000} s.`,
		)
		H.metrics([
			{
				name: 'preload-error-ms',
				value: preloadTime,
				tags: [
					{
						name: 'SecureID',
						value: secureID,
					},
				],
			},
		])
	} catch (e: any) {
		const msg = `failed to preload error group ${secureID}`
		console.warn(msg)
		H.consumeError(e, msg)
	}
}