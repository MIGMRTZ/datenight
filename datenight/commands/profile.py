"""CLI commands for managing partner profiles."""

import uuid

import typer
from rich.panel import Panel
from rich.table import Table

from datenight.api_client import ConflictError, get_client
from datenight.commands._common import console, handle_api_errors

profile_app = typer.Typer(name="profile", help="Manage partner profiles.")


def _prompt_list(label: str, default: str = "") -> list[str]:
    """Prompt for a comma-separated list, return stripped items."""
    raw = typer.prompt(label, default=default)
    return [item.strip() for item in raw.split(",") if item.strip()]


def _display_profile(profile: dict) -> None:  # type: ignore[type-arg]
    """Display a profile as a Rich panel."""
    lines = [
        f"[bold]Name:[/bold] {profile['name']}",
        f"[bold]Cuisines:[/bold] {', '.join(profile.get('cuisines', []))}",
        f"[bold]Movie Genres:[/bold] {', '.join(profile.get('movie_genres', []))}",
        f"[bold]Activities:[/bold] {', '.join(profile.get('activities', []))}",
        f"[bold]Dietary Restrictions:[/bold] {', '.join(profile.get('dietary_restrictions', []))}",
        f"[bold]Dislikes:[/bold] {', '.join(profile.get('dislikes', []))}",
    ]
    title = f"Profile: {profile['name']}"
    console.print(Panel("\n".join(lines), title=title, subtitle=profile["id"]))


@profile_app.command("create")
@handle_api_errors
def create() -> None:
    """Create a new partner profile interactively."""
    client = get_client()
    name = typer.prompt("Name")
    cuisines = _prompt_list("Cuisines (comma-separated, ranked)")
    movie_genres = _prompt_list("Movie genres (comma-separated, ranked)")
    activities = _prompt_list("Activities (comma-separated, ranked)")
    dietary_restrictions = _prompt_list(
        "Dietary restrictions (optional, comma-separated)", default=""
    )
    dislikes = _prompt_list("Dislikes (optional, comma-separated)", default="")

    if not typer.confirm("Create this profile?", default=True):
        raise typer.Abort()

    profile = client.create_profile(
        {
            "id": str(uuid.uuid4()),
            "name": name,
            "cuisines": cuisines,
            "movie_genres": movie_genres,
            "activities": activities,
            "dietary_restrictions": dietary_restrictions,
            "dislikes": dislikes,
        }
    )
    console.print("\n[green]Profile created![/green]")
    _display_profile(profile)


@profile_app.command("list")
@handle_api_errors
def list_profiles() -> None:
    """List all partner profiles."""
    client = get_client()
    profiles = client.list_profiles()
    if not profiles:
        typer.echo("No profiles found. Run `datenight profile create` to get started.")
        return

    table = Table(title="Partner Profiles")
    table.add_column("ID", style="dim", max_width=12)
    table.add_column("Name", style="bold")
    table.add_column("Cuisines")
    table.add_column("Activities")

    for p in profiles:
        table.add_row(
            p["id"][:12],
            p["name"],
            ", ".join(p.get("cuisines", [])[:3]),
            ", ".join(p.get("activities", [])[:3]),
        )
    console.print(table)


@profile_app.command("show")
@handle_api_errors
def show(profile_id: str) -> None:
    """Display a partner's full profile."""
    client = get_client()
    profile = client.get_profile(profile_id)
    _display_profile(profile)


@profile_app.command("edit")
@handle_api_errors
def edit(profile_id: str) -> None:
    """Update a partner's preferences interactively."""
    client = get_client()
    current = client.get_profile(profile_id)

    name = typer.prompt("Name", default=current["name"])
    cuisines = _prompt_list("Cuisines", default=", ".join(current.get("cuisines", [])))
    movie_genres = _prompt_list("Movie genres", default=", ".join(current.get("movie_genres", [])))
    activities = _prompt_list("Activities", default=", ".join(current.get("activities", [])))
    dietary_restrictions = _prompt_list(
        "Dietary restrictions",
        default=", ".join(current.get("dietary_restrictions", [])),
    )
    dislikes = _prompt_list("Dislikes", default=", ".join(current.get("dislikes", [])))

    updated = client.update_profile(
        profile_id,
        {
            "name": name,
            "cuisines": cuisines,
            "movie_genres": movie_genres,
            "activities": activities,
            "dietary_restrictions": dietary_restrictions,
            "dislikes": dislikes,
        },
    )
    console.print("\n[green]Profile updated![/green]")
    _display_profile(updated)


@profile_app.command("delete")
def delete(profile_id: str) -> None:
    """Delete a partner profile."""
    try:
        client = get_client()
        profile = client.get_profile(profile_id)
        if not typer.confirm(f"Delete profile '{profile['name']}'?"):
            raise typer.Abort()
        client.delete_profile(profile_id)
        typer.echo(f"Profile '{profile['name']}' deleted.")
    except ConflictError:
        msg = "Cannot delete — partner is in a couple. Run `datenight couple unlink` first."
        typer.echo(msg, err=True)
        raise typer.Exit(1)
