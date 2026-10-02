// Reference CDM of cases/tv-shows.md §4, built with the same operations the editor uses.

import { CARD, emptyModel, type Model } from '../../core/metamodel'
import {
  addAttribute,
  addDomain,
  addEntity,
  addInheritance,
  addRelationship,
  updateEntity,
} from '../../core/ops'

export function buildTvShows(): Model {
  const m = emptyModel('TV Shows')
  m.comment = 'Reference model for cases/tv-shows.md (NOVA IMS DBMS, Class 03).'

  const email = addDomain(m, { name: 'Email', dataType: 'Variable characters', length: 100 })
  const phone = addDomain(m, { name: 'Phone', dataType: 'Variable characters', length: 20 })

  const show = addEntity(m, { name: 'TVShow', position: { x: 40, y: 40 } })
  addAttribute(m, show.id, { name: 'show_id', dataType: 'Integer', primary: true })
  addAttribute(m, show.id, { name: 'title', length: 100, mandatory: true })
  addAttribute(m, show.id, { name: 'genre', length: 50 })
  addAttribute(m, show.id, { name: 'release_year', dataType: 'Short integer' })

  const episode = addEntity(m, { name: 'Episode', position: { x: 40, y: 300 } })
  addAttribute(m, episode.id, { name: 'episode_id', dataType: 'Integer', primary: true })
  addAttribute(m, episode.id, { name: 'title', length: 100, mandatory: true })
  addAttribute(m, episode.id, { name: 'summary', dataType: 'Text' })
  addAttribute(m, episode.id, { name: 'duration_min', dataType: 'Short integer' })

  const scene = addEntity(m, { name: 'Scene', position: { x: 40, y: 560 } })
  addAttribute(m, scene.id, { name: 'order_no', dataType: 'Integer', primary: true })
  updateEntity(m, scene.id, { comment: 'Identified by its episode and a (not sequential) order number.' })

  const indoor = addEntity(m, { name: 'IndoorScene', position: { x: -110, y: 860 } })
  addAttribute(m, indoor.id, { name: 'scenario', length: 100 })
  addAttribute(m, indoor.id, { name: 'studio', length: 100 })

  const outdoor = addEntity(m, { name: 'OutdoorScene', position: { x: 160, y: 860 } })
  addAttribute(m, outdoor.id, { name: 'location', length: 100 })
  addAttribute(m, outdoor.id, { name: 'landscape_type', length: 50 })

  const person = addEntity(m, { name: 'Person', position: { x: 1130, y: 330 } })
  addAttribute(m, person.id, { name: 'person_id', dataType: 'Integer', primary: true })
  addAttribute(m, person.id, { name: 'name', length: 100, mandatory: true })
  addAttribute(m, person.id, { name: 'phone', domainId: phone.id })
  addAttribute(m, person.id, { name: 'email', domainId: email.id })

  const director = addEntity(m, { name: 'Director', position: { x: 760, y: 200 } })
  const actor = addEntity(m, { name: 'Actor', position: { x: 760, y: 520 } })
  const technician = addEntity(m, { name: 'Technician', position: { x: 760, y: 760 } })

  const role = addEntity(m, { name: 'Role', position: { x: 420, y: 520 } })
  addAttribute(m, role.id, { name: 'role_name', length: 100, mandatory: true })
  updateEntity(m, role.id, { comment: 'Actor × Scene, no own id: just one role per actor in each scene.' })

  const techFn = addEntity(m, { name: 'TechnicianFunction', position: { x: 400, y: 760 } })
  addAttribute(m, techFn.id, { name: 'function_no', dataType: 'Integer', primary: true })
  addAttribute(m, techFn.id, { name: 'function_name', length: 50, mandatory: true })
  updateEntity(m, techFn.id, { comment: 'Technician × Scene with own id: several functions in the same scene.' })

  const showDirector = addEntity(m, { name: 'ShowDirector', position: { x: 420, y: 60 } })

  addRelationship(m, show.id, episode.id, { name: 'has_episodes', cardinalityA: CARD.oneOne, cardinalityB: CARD.oneMany })
  addRelationship(m, episode.id, scene.id, { name: 'has_scenes', cardinalityB: CARD.oneMany, dependentSide: 'B' })
  addRelationship(m, actor.id, role.id, { name: 'actor_role', cardinalityB: CARD.zeroMany, dependentSide: 'B' })
  addRelationship(m, scene.id, role.id, { name: 'scene_role', cardinalityB: CARD.zeroMany, dependentSide: 'B' })
  addRelationship(m, technician.id, techFn.id, { name: 'technician_function', dependentSide: 'B' })
  addRelationship(m, scene.id, techFn.id, { name: 'scene_function', dependentSide: 'B' })
  addRelationship(m, show.id, showDirector.id, { name: 'show_directors', cardinalityB: CARD.oneMany, dependentSide: 'B' })
  addRelationship(m, director.id, showDirector.id, { name: 'director_shows', dependentSide: 'B' })
  addRelationship(m, showDirector.id, episode.id, {
    name: 'directs_episode',
    comment:
      'Each episode is directed by one person, who must be a director of that show. Linking Episode to ' +
      'ShowDirector (not to Director) avoids the cycle Episode → TVShow → ShowDirector → Director ← Episode: ' +
      'in the PDM show_id becomes one shared column, so the conflict cannot be stored.',
  })

  addInheritance(m, scene.id, [indoor.id, outdoor.id], {
    name: 'scene_kind',
    mutuallyExclusive: true,
    complete: true,
    generation: 'both',
    position: { x: 110, y: 760 },
  })
  const participants = addInheritance(m, person.id, [director.id, actor.id, technician.id], {
    name: 'participant_kind',
    mutuallyExclusive: false,
    complete: true,
    generation: 'both',
    position: { x: 1010, y: 520 },
  })
  participants.comment = 'Not exclusive: the same person may act in one show and direct another.'

  return m
}
