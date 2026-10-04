// Reference CDM of cases/football.md — own example, difficulty 3.
// Ideas: two relationships to the same entity told apart by roles (home / away team), history with
// an own id (Contract), a dependent entity numbered inside its parent (Goal in Match), derived data
// that is not stored (the score), and a rule that becomes a key over migrated columns.

import { emptyModel, type Model } from '../../core/metamodel'
import { addAttribute, addDomain, addEntity, addIdentifier, addPhysicalKey, addRelationship, updateEntity } from '../../core/ops'

export function buildFootball(): Model {
  const m = emptyModel('Football League')
  m.comment = 'Own case: seasons, teams, players, contracts, matches and goals.'

  const name = addDomain(m, { name: 'Name', dataType: 'Variable characters', length: 100 })

  const season = addEntity(m, { name: 'Season', position: { x: 40, y: 40 } })
  addAttribute(m, season.id, { name: 'start_year', dataType: 'Short integer', primary: true })

  const team = addEntity(m, { name: 'Team', position: { x: 340, y: 40 } })
  addAttribute(m, team.id, { name: 'team_id', dataType: 'Integer', primary: true })
  const teamName = addAttribute(m, team.id, { name: 'name', length: 50, mandatory: true })
  addIdentifier(m, team.id, { name: 'name', isPrimary: false, attributeIds: [teamName.id] })
  addAttribute(m, team.id, { name: 'city', length: 50, mandatory: true })
  addAttribute(m, team.id, { name: 'founded_year', dataType: 'Short integer' })

  const player = addEntity(m, { name: 'Player', position: { x: 950, y: 40 } })
  addAttribute(m, player.id, { name: 'player_no', dataType: 'Integer', primary: true })
  addAttribute(m, player.id, { name: 'name', domainId: name.id, mandatory: true })
  addAttribute(m, player.id, { name: 'birth_date', dataType: 'Date', mandatory: true })
  addAttribute(m, player.id, { name: 'nationality', length: 50 })

  const contract = addEntity(m, { name: 'Contract', position: { x: 650, y: 40 } })
  addAttribute(m, contract.id, { name: 'contract_id', dataType: 'Integer', primary: true })
  addAttribute(m, contract.id, { name: 'start_date', dataType: 'Date', mandatory: true })
  addAttribute(m, contract.id, { name: 'end_date', dataType: 'Date', comment: 'NULL while the contract runs' })
  addAttribute(m, contract.id, { name: 'shirt_no', dataType: 'Short integer', mandatory: true })
  updateEntity(m, contract.id, { comment: 'Player × Team over time; a player may return to a former team, hence an own id.' })

  const match = addEntity(m, { name: 'Match', position: { x: 340, y: 360 } })
  addAttribute(m, match.id, { name: 'match_id', dataType: 'Integer', primary: true })
  addAttribute(m, match.id, { name: 'match_date', dataType: 'Date', mandatory: true })
  addPhysicalKey(m, match.id, { name: 'AK_MATCH_PAIRING', columns: ['start_year', 'home_team_id', 'away_team_id'] })

  const goal = addEntity(m, { name: 'Goal', position: { x: 810, y: 360 } })
  addAttribute(m, goal.id, { name: 'goal_no', dataType: 'Short integer', primary: true })
  addAttribute(m, goal.id, { name: 'minute', dataType: 'Short integer', mandatory: true })
  updateEntity(m, goal.id, { comment: 'Numbered inside its match: two goals can fall in the same minute.' })

  addRelationship(m, player.id, contract.id, { name: 'signs' })
  addRelationship(m, team.id, contract.id, { name: 'employs' })
  addRelationship(m, season.id, match.id, { name: 'in_season' })
  addRelationship(m, team.id, match.id, { name: 'plays_home', roleA: 'home' })
  addRelationship(m, team.id, match.id, { name: 'plays_away', roleA: 'away' })
  addRelationship(m, match.id, goal.id, { name: 'has_goals', dependentSide: 'B' })
  addRelationship(m, player.id, goal.id, { name: 'scores' })

  return m
}
